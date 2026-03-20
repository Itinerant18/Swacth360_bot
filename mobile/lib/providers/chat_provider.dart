import 'package:flutter/foundation.dart';

import '../models/message_model.dart';
import '../services/chat_service.dart';
import '../services/conversation_service.dart';

class ChatProvider extends ChangeNotifier {
  final _chatService = ChatService();
  final _convService = ConversationService();

  List<ChatMessage> _messages = [];
  bool _isLoading = false;
  String? _error;
  String? _activeConversationId;
  bool _sessionSaved = false;

  List<ChatMessage> get messages => _messages;
  bool get isLoading => _isLoading;
  bool get hasMessages => _messages.isNotEmpty;
  String? get error => _error;
  String? get activeConversationId => _activeConversationId;
  bool get sessionSaved => _sessionSaved;

  void clearError() {
    _error = null;
    notifyListeners();
  }

  void startNewConversation() {
    _messages = [];
    _activeConversationId = null;
    _error = null;
    _isLoading = false;
    _sessionSaved = false;
    notifyListeners();
  }

  Future<void> sendMessage(
    String text, {
    required String language,
    String? userId,
    String? accessToken,
  }) async {
    final userMsg = ChatMessage.user(text);
    _messages = [..._messages, userMsg];
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final apiMessages = _messages.map((m) => m.toApiJson()).toList();

      final result = await _chatService.sendMessage(
        messages: apiMessages,
        language: language,
        conversationId: _activeConversationId,
        userId: userId,
        accessToken: accessToken,
      );

      final assistantMsg = ChatMessage.assistant(result.text);
      _messages = [..._messages, assistantMsg];
      _activeConversationId = result.conversationId ?? _activeConversationId;

      // Auto-save after first exchange if authenticated
      if (_messages.length == 2 && accessToken != null && !_sessionSaved) {
        final title = text.length > 60 ? '${text.substring(0, 60)}...' : text;
        try {
          await saveSession(title, accessToken: accessToken);
        } catch (_) {
          // Silent fail for auto-save
        }
      }
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> addDiagramMessage(DiagramData data) async {
    final msg = ChatMessage.diagram(data);
    _messages = [..._messages, msg];
    notifyListeners();
  }

  Future<void> loadConversation(String conversationId) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final msgs = await _convService.fetchMessages(conversationId);
      _messages = msgs;
      _activeConversationId = conversationId;
      _sessionSaved = true;
    } catch (e) {
      _error = 'Failed to load conversation';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> saveSession(String title, {String? accessToken}) async {
    try {
      final convId = await _convService.saveConversation(
        title: title,
        messages: _messages,
        conversationId: _activeConversationId,
      );
      _activeConversationId = convId;
      _sessionSaved = true;
      notifyListeners();
    } catch (e) {
      rethrow;
    }
  }

  void updateMessageFeedback(String messageId, int rating) {
    _messages = _messages.map((m) {
      if (m.id == messageId) return m.copyWith(feedbackRating: rating);
      return m;
    }).toList();
    notifyListeners();
  }
}
