import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class ChatService {
  Future<({String text, String? conversationId, bool isDiagram, Map<String, dynamic>? diagramJson})> sendMessage({
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
      'Accept': '*/*',
      'User-Agent': 'SAI-Mobile/1.0',
    };
    if (accessToken != null) {
      headers['Authorization'] = 'Bearer $accessToken';
    }

    try {
      debugPrint('[ChatService] POST ${uri.toString()}');
      debugPrint('[ChatService] Body: ${jsonEncode(body).substring(0, min(100, jsonEncode(body).length))}');

      final response = await http.post(
        uri,
        headers: headers,
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 90));

      debugPrint('[ChatService] Status: ${response.statusCode}');
      debugPrint('[ChatService] Body preview: ${response.body.substring(0, min(300, response.body.length))}');

      if (response.statusCode == 405) {
        throw Exception('API method not allowed. Check endpoint URL.');
      }
      if (response.statusCode == 429) {
        throw Exception('Rate limit reached. Please wait a moment.');
      }
      if (response.statusCode != 200) {
        throw Exception('Server error (${response.statusCode}): ${response.body.substring(0, min(200, response.body.length))}');
      }

      final respConvId = response.headers['x-conversation-id'];
      final text = _parseBody(response.body);

      debugPrint('[ChatService] Parsed text: ${text.substring(0, min(100, text.length))}');

      // Check for diagram response
      if (text.startsWith('DIAGRAM_RESPONSE:')) {
        try {
          final jsonStr = text.substring('DIAGRAM_RESPONSE:'.length);
          final diagramJson = jsonDecode(jsonStr) as Map<String, dynamic>;
          return (
            text: text,
            conversationId: respConvId ?? conversationId,
            isDiagram: true,
            diagramJson: diagramJson,
          );
        } catch (e) {
          debugPrint('[ChatService] Diagram parse error: $e');
        }
      }

      return (
        text: text,
        conversationId: respConvId ?? conversationId,
        isDiagram: false,
        diagramJson: null,
      );

    } on SocketException catch (e) {
      debugPrint('[ChatService] SocketException: $e');
      throw Exception('No internet connection. Check your network.');
    } on TimeoutException {
      throw Exception('Request timed out. Please try again.');
    } on http.ClientException catch (e) {
      debugPrint('[ChatService] ClientException: $e');
      throw Exception('Connection failed: ${e.message}');
    } catch (e) {
      debugPrint('[ChatService] Unknown error: $e');
      rethrow;
    }
  }

  String _parseBody(String body) {
    // Method 1: Vercel AI SDK stream format  0:"text"\n
    final buffer = StringBuffer();
    for (final line in body.split('\n')) {
      final trimmed = line.trim();
      if (trimmed.startsWith('0:')) {
        try {
          final jsonStr = trimmed.substring(2);
          final decoded = jsonDecode(jsonStr);
          if (decoded is String) {
            buffer.write(decoded);
          }
        } catch (_) {
          // Method 2: manual strip quotes
          final raw = trimmed.substring(2);
          if (raw.startsWith('"') && raw.endsWith('"') && raw.length > 2) {
            buffer.write(raw
                .substring(1, raw.length - 1)
                .replaceAll(r'\n', '\n')
                .replaceAll(r'\"', '"')
                .replaceAll(r'\\', '\\'));
          }
        }
      }
    }

    final result = buffer.toString().trim();

    // Method 3: if parsing failed, try raw body as JSON string
    if (result.isEmpty) {
      try {
        final decoded = jsonDecode(body);
        if (decoded is String) return decoded;
        if (decoded is Map && decoded.containsKey('text')) {
          return decoded['text'] as String;
        }
        if (decoded is Map && decoded.containsKey('content')) {
          return decoded['content'] as String;
        }
      } catch (_) {}
      // Method 4: return raw body as last resort
      return body.trim();
    }

    return result;
  }
}
