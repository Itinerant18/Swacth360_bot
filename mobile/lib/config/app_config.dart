import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  static String get apiBaseUrl => dotenv.env['API_BASE_URL'] ?? 'https://sai.seple.in';

  static String get supabaseUrl => dotenv.env['SUPABASE_URL'] ?? 'https://uabcdknksljvsaasntjm.supabase.co';

  static String get supabaseAnonKey => dotenv.env['SUPABASE_ANON_KEY'] ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhYmNka25rc2xqdnNhYXNudGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMjY1NjAsImV4cCI6MjA4ODcwMjU2MH0.0XDSvSwaBrALFgJ2sT-ljR1aN0h8QKlAkmmyqQoUzIg';

  static const int guestChatLimit = 3;
  static const String appVersion = '1.0.0';
}
