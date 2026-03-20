import 'package:flutter/foundation.dart';

class HomeScreenController extends ChangeNotifier {
  int currentIndex = 0;

  void goToChat() {
    currentIndex = 0;
    notifyListeners();
  }

  void goToHistory() {
    currentIndex = 1;
    notifyListeners();
  }

  void goToProfile() {
    currentIndex = 2;
    notifyListeners();
  }

  void setIndex(int index) {
    currentIndex = index;
    notifyListeners();
  }
}
