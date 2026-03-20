import 'package:flutter/foundation.dart';

class GuestLimitException implements Exception {
  final String message;
  const GuestLimitException([this.message = 'Guest chat limit reached']);
  @override
  String toString() => message;
}

class GuestProvider extends ChangeNotifier {
  int _count = 0;
  static const int limit = 3;

  bool get limitReached => _count >= limit;
  int get remaining => (limit - _count).clamp(0, limit);

  void increment() {
    _count++;
    notifyListeners();
  }

  void reset() {
    _count = 0;
    notifyListeners();
  }
}
