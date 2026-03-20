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
    return await _client.auth.signInWithPassword(
      email: email,
      password: password,
    );
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
