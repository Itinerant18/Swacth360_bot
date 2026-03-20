import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/message_model.dart';

class DiagramService {
  Future<DiagramData> requestDiagram({
    required String query,
    String? panelType,
    String? diagramType,
    String language = 'en',
    String? accessToken,
  }) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}/api/diagram');

    final body = <String, dynamic>{
      'query': query,
      'language': language,
    };
    if (panelType != null) body['panelType'] = panelType;
    if (diagramType != null) body['diagramType'] = diagramType;

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
        throw Exception('Diagram generation failed (${response.statusCode})');
      }

      final json = jsonDecode(response.body) as Map<String, dynamic>;
      if (json['success'] != true) {
        throw Exception('Diagram generation failed');
      }

      return DiagramData.fromJson(json);
    } on SocketException {
      throw Exception('No internet connection. Check your network.');
    }
  }
}
