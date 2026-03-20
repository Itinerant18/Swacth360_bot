import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/conversation_model.dart';
import '../models/message_model.dart';

class ConversationService {
  final _client = Supabase.instance.client;

  Future<List<ConversationModel>> fetchConversations() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return [];

    final response = await _client
        .from('conversations')
        .select('*, messages(count)')
        .eq('user_id', userId)
        .order('updated_at', ascending: false);

    return (response as List).map((row) {
      final count = row['messages'] is List
          ? (row['messages'] as List).isNotEmpty
              ? (row['messages'][0]['count'] as int? ?? 0)
              : 0
          : 0;
      return ConversationModel.fromJson({
        ...row as Map<String, dynamic>,
        'message_count': count,
      });
    }).toList();
  }

  Future<List<ChatMessage>> fetchMessages(String conversationId) async {
    final response = await _client
        .from('messages')
        .select()
        .eq('conversation_id', conversationId)
        .order('created_at', ascending: true);

    return (response as List)
        .map((row) => ChatMessage.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  Future<void> deleteConversation(String conversationId) async {
    await _client
        .from('conversations')
        .delete()
        .eq('id', conversationId);
  }

  Future<String> saveConversation({
    required String title,
    required List<ChatMessage> messages,
    String? conversationId,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');

    String convId;
    if (conversationId != null) {
      convId = conversationId;
      await _client.from('conversations').update({
        'title': title,
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('id', convId);
    } else {
      final result = await _client.from('conversations').insert({
        'user_id': userId,
        'title': title,
        'created_at': DateTime.now().toIso8601String(),
        'updated_at': DateTime.now().toIso8601String(),
      }).select('id').single();
      convId = result['id'] as String;
    }

    return convId;
  }
}
