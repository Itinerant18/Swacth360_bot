import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/chat_provider.dart';
import '../providers/home_screen_controller.dart';
import '../theme/app_theme.dart';
import 'chat/chat_screen.dart';
import 'history/history_screen.dart';
import 'profile/profile_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  static const _screens = [ChatScreen(), HistoryScreen(), ProfileScreen()];

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<HomeScreenController>();

    return Scaffold(
      backgroundColor: AppColors.bgDesk,
      body: IndexedStack(index: controller.currentIndex, children: _screens),
      bottomNavigationBar: _BottomNav(
        currentIndex: controller.currentIndex,
        onTap: (i) {
          if (i == 0 && controller.currentIndex == 0) {
            context.read<ChatProvider>().startNewConversation();
          }
          controller.setIndex(i);
        },
      ),
    );
  }
}

class _BottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  const _BottomNav({required this.currentIndex, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFFD4CFC7),
        border: Border(top: BorderSide(color: AppColors.borderStitch)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            _NavItem(
              icon: Icons.chat_bubble_outline_rounded,
              activeIcon: Icons.chat_bubble_rounded,
              label: 'Chat',
              index: 0,
              current: currentIndex,
              onTap: onTap,
            ),
            _NavItem(
              icon: Icons.history_rounded,
              activeIcon: Icons.history_rounded,
              label: 'History',
              index: 1,
              current: currentIndex,
              onTap: onTap,
            ),
            _NavItem(
              icon: Icons.person_outline_rounded,
              activeIcon: Icons.person_rounded,
              label: 'Profile',
              index: 2,
              current: currentIndex,
              onTap: onTap,
            ),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon, activeIcon;
  final String label;
  final int index, current;
  final ValueChanged<int> onTap;

  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.index,
    required this.current,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final active = index == current;
    return Expanded(
      child: InkWell(
        onTap: () => onTap(index),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Icon(
                  active ? activeIcon : icon,
                  key: ValueKey(active),
                  color: active ? AppColors.brass : AppColors.textPencil,
                  size: 22,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                  color: active ? AppColors.brass : AppColors.textPencil,
                  letterSpacing: 0.3,
                ),
              ),
              const SizedBox(height: 2),
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                height: 2.5,
                width: active ? 18 : 0,
                decoration: BoxDecoration(
                  color: AppColors.brass,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
