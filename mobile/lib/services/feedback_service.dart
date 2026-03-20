import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class FeedbackService {
  Future<void> submitFeedback({
    required String conversationId,
    required String messageId,
    required int rating,
    String? accessToken,
  }) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}/api/feedback');

    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    if (accessToken != null) {
      headers['Authorization'] = 'Bearer $accessToken';
    }

    await http.post(
      uri,
      headers: headers,
      body: jsonEncode({
        'messageId': messageId,
        'conversationId': conversationId,
        'rating': rating,
      }),
    );
  }
}
