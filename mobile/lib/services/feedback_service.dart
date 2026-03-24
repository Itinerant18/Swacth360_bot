import 'dart:io';
import 'dart:convert';
import 'dart:async';
import 'package:flutter/foundation.dart';
import '../config/app_config.dart';

class FeedbackService {
  Future<void> submitFeedback({
    required String conversationId,
    required String messageId,
    required int rating,
    String? accessToken,
  }) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}/api/feedback');

    final bodyStr = jsonEncode({
      'messageId': messageId,
      'conversationId': conversationId,
      'rating': rating,
    });

    debugPrint('[FeedbackService] POST ${uri.toString()}');

    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 15);

      final request = await client.postUrl(uri);

      request.headers.set('Content-Type', 'application/json');
      request.headers.set('User-Agent', 'SAI-Mobile/1.0 Dart/HttpClient');
      if (accessToken != null) {
        request.headers.set('Authorization', 'Bearer $accessToken');
      }

      request.write(bodyStr);

      final response = await request.close()
          .timeout(const Duration(seconds: 15));

      debugPrint('[FeedbackService] Status: ${response.statusCode}');

      // Drain the response body to release the connection
      await response.drain<void>();

      client.close();

    } on SocketException catch (e) {
      debugPrint('[FeedbackService] SocketException: $e — feedback silently failed');
    } on TimeoutException {
      debugPrint('[FeedbackService] Timeout — feedback silently failed');
    } on HttpException catch (e) {
      debugPrint('[FeedbackService] HttpException: $e — feedback silently failed');
    } catch (e) {
      debugPrint('[FeedbackService] Unknown: $e — feedback silently failed');
      // Feedback failures are always silent — never rethrow
    }
  }
}
