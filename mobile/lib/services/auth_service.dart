import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  final _client = Supabase.instance.client;

  User? get currentUser => _client.auth.currentUser;
  String? get accessToken => _client.auth.currentSession?.accessToken;

  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;

  Future<AuthResponse> signIn({
    required String email,
    required String password,
  }) async {
    // TEMPORARY DEBUG — remove after fixing
    debugPrint('=== LOGIN ATTEMPT ===');
    debugPrint('Email: "$email"');
    debugPrint('Password length: ${password.length}');
    debugPrint('Password first char code: ${password.isNotEmpty ? password.codeUnitAt(0) : 0}');
    debugPrint('====================');

    try {
      return await _client.auth.signInWithPassword(
        email: email.trim().toLowerCase(),
        password: password,
      );
    } on AuthException catch (e) {
      final msg = e.message.toLowerCase();

      if (msg.contains('email not confirmed')) {
        throw AuthException(
          'Please confirm your email first. Check your inbox for a confirmation link.',
        );
      }
      if (msg.contains('invalid login') ||
          msg.contains('invalid credentials') ||
          msg.contains('wrong password')) {
        throw AuthException('Incorrect email or password.');
      }
      if (msg.contains('user not found')) {
        throw AuthException('No account found with this email.');
      }
      if (msg.contains('too many requests') ||
          msg.contains('rate limit')) {
        throw AuthException('Too many attempts. Please wait a few minutes.');
      }
      rethrow;
    }
  }

  Future<AuthResponse> signUp({
    required String email,
    required String password,
    String? fullName,
  }) async {
    return await _client.auth.signUp(
      email: email,
      password: password,
      data: fullName != null ? {'full_name': fullName} : null,
    );
  }

  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  Future<void> resetPassword(String email) async {
    await _client.auth.resetPasswordForEmail(email);
  }

  String getUserName() {
    final user = currentUser;
    if (user == null) return 'Guest';
    final meta = user.userMetadata;
    if (meta != null && meta['full_name'] != null) {
      return meta['full_name'] as String;
    }
    return user.email?.split('@').first ?? 'User';
  }
}
