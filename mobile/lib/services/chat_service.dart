import 'dart:io';
import 'dart:convert';
import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import '../config/app_config.dart';
import '../models/message_model.dart';

class ChatService {
  Future<({
    String text,
    String? conversationId,
    bool isDiagram,
    Map<String, dynamic>? diagramJson
  })> sendMessage({
    required List<Map<String, dynamic>> messages,
    required String language,
    String? conversationId,
    String? userId,
    String? accessToken,
  }) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}/api/chat');

    final bodyMap = <String, dynamic>{
      'messages': messages,
      'language': language,
    };
    if (conversationId != null) bodyMap['conversationId'] = conversationId;
    if (userId != null) bodyMap['userId'] = userId;

    final bodyStr = jsonEncode(bodyMap);

    debugPrint('[ChatService] POST ${uri.toString()}');
    debugPrint('[ChatService] Body: ${bodyStr.substring(0, min(150, bodyStr.length))}');

    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 30);

      final request = await client.postUrl(uri);

      request.headers.set('Content-Type', 'application/json');
      request.headers.set('Accept', '*/*');
      request.headers.set('User-Agent', 'SAI-Mobile/1.0 Dart/HttpClient');
      if (accessToken != null) {
        request.headers.set('Authorization', 'Bearer $accessToken');
      }

      request.write(bodyStr);

      final response = await request.close()
          .timeout(const Duration(seconds: 90));

      debugPrint('[ChatService] Status: ${response.statusCode}');

      final responseBody = await response
          .transform(utf8.decoder)
          .join();

      debugPrint('[ChatService] Body preview: ${responseBody.substring(0, min(300, responseBody.length))}');

      client.close();

      if (response.statusCode == 429) {
        throw Exception('Rate limit reached. Please wait a moment.');
      }
      if (response.statusCode != 200) {
        throw Exception('Server error (${response.statusCode})');
      }

      final convId = response.headers.value('x-conversation-id');
      final text = _parseBody(responseBody);

      debugPrint('[ChatService] Parsed: ${text.substring(0, min(100, text.length))}');

      if (text.startsWith('DIAGRAM_RESPONSE:')) {
        try {
          final jsonStr = text.substring('DIAGRAM_RESPONSE:'.length);
          final diagramJson = jsonDecode(jsonStr) as Map<String, dynamic>;
          return (
            text: text,
            conversationId: convId ?? conversationId,
            isDiagram: true,
            diagramJson: diagramJson,
          );
        } catch (e) {
          debugPrint('[ChatService] Diagram parse error: $e');
        }
      }

      return (
        text: text,
        conversationId: convId ?? conversationId,
        isDiagram: false,
        diagramJson: null,
      );

    } on SocketException catch (e) {
      debugPrint('[ChatService] SocketException: $e');
      throw Exception('No internet connection. Check your network.');
    } on TimeoutException {
      debugPrint('[ChatService] Timeout');
      throw Exception('Request timed out. Please try again.');
    } on TlsException catch (e) {
      debugPrint('[ChatService] TLS Error: $e');
      throw Exception('SSL error. Please check your connection.');
    } on HttpException catch (e) {
      debugPrint('[ChatService] HttpException: $e');
      throw Exception('Connection failed: ${e.message}');
    } catch (e) {
      debugPrint('[ChatService] Unknown: $e');
      rethrow;
    }
  }

  String _parseBody(String body) {
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
    if (result.isNotEmpty) return result;

    try {
      final decoded = jsonDecode(body);
      if (decoded is String) return decoded;
      if (decoded is Map) {
        return (decoded['text'] ?? decoded['content'] ?? body) as String;
      }
    } catch (_) {}

    return body.trim();
  }
}
