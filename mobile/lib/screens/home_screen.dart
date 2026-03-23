import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import 'chat/chat_screen.dart';
import 'history/history_drawer.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      drawer: auth.isAuthenticated ? const HistoryDrawer() : null,
      body: const ChatScreen(),
    );
  }
}

