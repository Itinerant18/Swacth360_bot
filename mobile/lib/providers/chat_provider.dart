import 'package:flutter/foundation.dart';

import '../models/message_model.dart';
import '../services/chat_service.dart';
import '../services/conversation_service.dart';
import '../services/feedback_service.dart';

class ChatProvider extends ChangeNotifier {
  final _chatService = ChatService();
  final _convService = ConversationService();
  final _feedbackService = FeedbackService();

  List<ChatMessage> _messages = [];
  bool _isLoading = false;
  String? _error;
  String? _activeConversationId;
  String? _sessionTitle;
  bool _sessionSaved = false;
  String? _storedAccessToken;

  List<ChatMessage> get messages => _messages;
  bool get isLoading => _isLoading;
  bool get hasMessages => _messages.isNotEmpty;
  String? get error => _error;
  String? get activeConversationId => _activeConversationId;
  String? get sessionTitle => _sessionTitle;
  bool get sessionSaved => _sessionSaved;

  void clearError() {
    _error = null;
    notifyListeners();
  }

  void startNewConversation() {
    _messages = [];
    _activeConversationId = null;
    _sessionTitle = null;
    _error = null;
    _isLoading = false;
    _sessionSaved = false;
    _storedAccessToken = null;
    notifyListeners();
  }

  Future<void> sendMessage(
    String text, {
    required String language,
    String? userId,
    String? accessToken,
  }) async {
    if (accessToken != null) _storedAccessToken = accessToken;

    final userMsg = ChatMessage.user(text);
    _messages = [..._messages, userMsg];
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final apiMessages = _messages
          .where(
              (m) => m.diagram == null) // exclude diagram messages from history
          .map((m) => m.toApiJson())
          .toList();

      final result = await _chatService.sendMessage(
        messages: apiMessages,
        language: language,
        conversationId: _activeConversationId,
        userId: userId,
        accessToken: accessToken,
      );

      _activeConversationId = result.conversationId ?? _activeConversationId;

      if (result.isDiagram && result.diagramJson != null) {
        final diagramData = DiagramData.fromJson(result.diagramJson!);
        _messages = [..._messages, ChatMessage.diagram(diagramData)];
      } else {
        _messages = [..._messages, ChatMessage.assistant(result.text)];
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

  Future<void> saveSessionWithTitle(String title) async {
    try {
      if (_activeConversationId != null) {
        // Conversation already exists on server — just rename it
        await _convService.renameConversation(_activeConversationId!, title);
      } else {
        // No server conversation yet — create one directly via Supabase
        final convId = await _convService.saveConversation(
          title: title,
          messages: _messages,
          conversationId: null,
        );
        _activeConversationId = convId;
      }
      _sessionTitle = title;
      _sessionSaved = true;
      notifyListeners();
    } catch (e) {
      rethrow;
    }
  }

  void updateMessageFeedback(String messageId, int rating) {
    // Optimistic local update - instant UI response.
    _messages = _messages.map((m) {
      if (m.id == messageId) return m.copyWith(feedbackRating: rating);
      return m;
    }).toList();
    notifyListeners();

    // Fire-and-forget API call - only when a conversation exists on the backend.
    // Errors are swallowed inside FeedbackService; we never surface them to the user.
    final conversationId = _activeConversationId;
    if (conversationId != null) {
      _feedbackService.submitFeedback(
        conversationId: conversationId,
        messageId: messageId,
        rating: rating,
        accessToken: _storedAccessToken,
      );
    } else {
      debugPrint(
        '[ChatProvider] Feedback skipped - no active conversation '
        '(msg=$messageId rating=$rating)',
      );
    }
  }
}
