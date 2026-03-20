import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AppLanguage {
  en('en', 'English', 'EN'),
  bn('bn', 'Bengali', 'BN'),
  hi('hi', 'Hindi', 'HI');

  final String code;
  final String nativeName;
  final String shortCode;
  const AppLanguage(this.code, this.nativeName, this.shortCode);
}

class LanguageStrings {
  final String welcomeTitle;
  final String welcomeSubtitle;
  final List<String> quickPrompts;

  const LanguageStrings({
    required this.welcomeTitle,
    required this.welcomeSubtitle,
    required this.quickPrompts,
  });
}

const _strings = <AppLanguage, LanguageStrings>{
  AppLanguage.en: LanguageStrings(
    welcomeTitle: 'SAI \u2014 SWATCH Panel Support',
    welcomeSubtitle: 'Ask me anything about SEPLe and SWATCH 360 industrial control panels.',
    quickPrompts: [
      'How do I reset the SEPLe panel?',
      'Show wiring diagram for SWATCH 360',
      'E-47 error code \u2014 what does it mean?',
      'LED status indicators explanation',
      'Network configuration steps',
    ],
  ),
  AppLanguage.bn: LanguageStrings(
    welcomeTitle: 'SAI \u2014 SWATCH \u09AA\u09CD\u09AF\u09BE\u09A8\u09C7\u09B2 \u09B8\u09BE\u09AA\u09CB\u09B0\u09CD\u099F',
    welcomeSubtitle: 'SEPLe \u098F\u09AC\u0982 SWATCH 360 \u0987\u09A8\u09CD\u09A1\u09BE\u09B8\u09CD\u099F\u09CD\u09B0\u09BF\u09AF\u09BC\u09BE\u09B2 \u0995\u09A8\u09CD\u099F\u09CD\u09B0\u09CB\u09B2 \u09AA\u09CD\u09AF\u09BE\u09A8\u09C7\u09B2 \u09B8\u09AE\u09CD\u09AA\u09B0\u09CD\u0995\u09C7 \u09AF\u09C7\u0995\u09CB\u09A8\u09CB \u09AA\u09CD\u09B0\u09B6\u09CD\u09A8 \u0995\u09B0\u09C1\u09A8\u0964',
    quickPrompts: [
      'SEPLe \u09AA\u09CD\u09AF\u09BE\u09A8\u09C7\u09B2 \u09B0\u09BF\u09B8\u09C7\u099F \u0995\u09BF\u09AD\u09BE\u09AC\u09C7 \u0995\u09B0\u09AC?',
      'SWATCH 360 \u0993\u09AF\u09BC\u09BE\u09AF\u09BC\u09BE\u09B0\u09BF\u0982 \u09A1\u09BE\u09AF\u09BC\u09BE\u0997\u09CD\u09B0\u09BE\u09AE \u09A6\u09C7\u0996\u09BE\u09A8',
      'E-47 \u098F\u09B0\u09B0 \u0995\u09CB\u09A1\u09C7\u09B0 \u09AE\u09BE\u09A8\u09C7 \u0995\u09C0?',
      'LED \u09B8\u09CD\u099F\u09CD\u09AF\u09BE\u099F\u09BE\u09B8 \u0987\u09A8\u09CD\u09A1\u09BF\u0995\u09C7\u099F\u09B0 \u09AC\u09CD\u09AF\u09BE\u0996\u09CD\u09AF\u09BE',
      '\u09A8\u09C7\u099F\u0993\u09AF\u09BC\u09BE\u09B0\u09CD\u0995 \u0995\u09A8\u09AB\u09BF\u0997\u09BE\u09B0\u09C7\u09B6\u09A8 \u09AA\u09A6\u0995\u09CD\u09B7\u09C7\u09AA',
    ],
  ),
  AppLanguage.hi: LanguageStrings(
    welcomeTitle: 'SAI \u2014 SWATCH \u092A\u0948\u0928\u0932 \u0938\u0939\u093E\u092F\u0924\u093E',
    welcomeSubtitle: 'SEPLe \u0914\u0930 SWATCH 360 \u0907\u0902\u0921\u0938\u094D\u091F\u094D\u0930\u093F\u092F\u0932 \u0915\u0902\u091F\u094D\u0930\u094B\u0932 \u092A\u0948\u0928\u0932 \u0915\u0947 \u092C\u093E\u0930\u0947 \u092E\u0947\u0902 \u0915\u0941\u091B \u092D\u0940 \u092A\u0942\u091B\u0947\u0902\u0964',
    quickPrompts: [
      'SEPLe \u092A\u0948\u0928\u0932 \u0930\u0940\u0938\u0947\u091F \u0915\u0948\u0938\u0947 \u0915\u0930\u0947\u0902?',
      'SWATCH 360 \u0935\u093E\u092F\u0930\u093F\u0902\u0917 \u0921\u093E\u092F\u0917\u094D\u0930\u093E\u092E \u0926\u093F\u0916\u093E\u090F\u0902',
      'E-47 \u090F\u0930\u0930 \u0915\u094B\u0921 \u0915\u093E \u092E\u0924\u0932\u092C \u0915\u094D\u092F\u093E \u0939\u0948?',
      'LED \u0938\u094D\u091F\u0947\u091F\u0938 \u0907\u0902\u0921\u093F\u0915\u0947\u091F\u0930 \u0938\u092E\u091D\u093E\u090F\u0902',
      '\u0928\u0947\u091F\u0935\u0930\u094D\u0915 \u0915\u0949\u0928\u094D\u0ab2\u093F\u0917\u0930\u0947\u0936\u0928 \u0915\u0947 \u091A\u0930\u0923',
    ],
  ),
};

class LanguageProvider extends ChangeNotifier {
  AppLanguage _language = AppLanguage.en;
  static const _key = 'app_language';

  LanguageProvider() {
    _load();
  }

  AppLanguage get language => _language;
  String get code => _language.code;
  LanguageStrings get strings => _strings[_language]!;

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_key);
    if (saved != null) {
      _language = AppLanguage.values.firstWhere(
        (l) => l.code == saved,
        orElse: () => AppLanguage.en,
      );
      notifyListeners();
    }
  }

  Future<void> set(AppLanguage lang) async {
    if (_language == lang) return;
    _language = lang;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, lang.code);
  }
}
