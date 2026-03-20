import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class ChatService {
  Future<({String text, String? conversationId})> sendMessage({
    required List<Map<String, dynamic>> messages,
    required String language,
    String? conversationId,
    String? userId,
    String? accessToken,
  }) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}/api/chat');

    final body = <String, dynamic>{
      'messages': messages,
      'language': language,
    };
    if (conversationId != null) body['conversationId'] = conversationId;
    if (userId != null) body['userId'] = userId;

    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    if (accessToken != null) {
      headers['Authorization'] = 'Bearer $accessToken';
    }

    try {
      final response = await http.post(
        uri,
        headers: headers,
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 60));

      if (response.statusCode == 429) {
        throw Exception('Rate limit reached. Please wait a moment.');
      }
      if (response.statusCode != 200) {
        throw HttpException('Server error (${response.statusCode})');
      }

      final respConvId = response.headers['x-conversation-id'];
      final text = _parseStreamResponse(response.body);

      return (text: text, conversationId: respConvId ?? conversationId);
    } on SocketException {
      throw Exception('No internet connection. Check your network.');
    } on TimeoutException {
      throw Exception('Request timed out. Please try again.');
    } on HttpException {
      throw Exception('Server error. Please try again.');
    }
  }

  String _parseStreamResponse(String body) {
    final buffer = StringBuffer();
    for (final line in body.split('\n')) {
      if (line.startsWith('0:"')) {
        final content = line.substring(3, line.length - 1);
        buffer.write(content
            .replaceAll(r'\n', '\n')
            .replaceAll(r'\"', '"')
            .replaceAll(r'\\', r'\'));
      }
    }
    return buffer.toString().trim();
  }
}
