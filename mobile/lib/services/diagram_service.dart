import 'dart:io';
import 'dart:convert';
import 'dart:async';
import 'package:flutter/foundation.dart';
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

    final bodyMap = <String, dynamic>{
      'query': query,
      'language': language,
    };
    if (panelType != null) bodyMap['panelType'] = panelType;
    if (diagramType != null) bodyMap['diagramType'] = diagramType;

    final bodyStr = jsonEncode(bodyMap);

    debugPrint('[DiagramService] POST ${uri.toString()}');

    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 30);

      final request = await client.postUrl(uri);

      request.headers.set('Content-Type', 'application/json');
      request.headers.set('Accept', 'application/json');
      request.headers.set('User-Agent', 'SAI-Mobile/1.0 Dart/HttpClient');
      if (accessToken != null) {
        request.headers.set('Authorization', 'Bearer $accessToken');
      }

      request.write(bodyStr);

      final response = await request.close()
          .timeout(const Duration(seconds: 60));

      debugPrint('[DiagramService] Status: ${response.statusCode}');

      final responseBody = await response
          .transform(utf8.decoder)
          .join();

      client.close();

      if (response.statusCode == 429) {
        throw Exception('Rate limit reached. Please wait a moment.');
      }
      if (response.statusCode != 200) {
        throw Exception('Diagram generation failed (${response.statusCode})');
      }

      final json = jsonDecode(responseBody) as Map<String, dynamic>;
      if (json['success'] != true) {
        throw Exception('Diagram generation failed');
      }

      return DiagramData.fromJson(json);

    } on SocketException catch (e) {
      debugPrint('[DiagramService] SocketException: $e');
      throw Exception('No internet connection. Check your network.');
    } on TimeoutException {
      debugPrint('[DiagramService] Timeout');
      throw Exception('Diagram request timed out. Please try again.');
    } on TlsException catch (e) {
      debugPrint('[DiagramService] TLS Error: $e');
      throw Exception('SSL error. Please check your connection.');
    } on HttpException catch (e) {
      debugPrint('[DiagramService] HttpException: $e');
      throw Exception('Connection failed: ${e.message}');
    } catch (e) {
      debugPrint('[DiagramService] Unknown: $e');
      rethrow;
    }
  }
}
