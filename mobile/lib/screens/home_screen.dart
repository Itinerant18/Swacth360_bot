import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'chat/chat_screen.dart';
import 'profile/profile_screen.dart';
import 'history/history_drawer.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: const HistoryDrawer(),
      body: IndexedStack(
        index: _tab,
        children: const [
          ChatScreen(),
          ProfileScreen(),
        ],
      ),
      bottomNavigationBar: _BottomNav(
        currentIndex: _tab,
        onTap: (index) {
          setState(() {
            _tab = index;
          });
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
        gradient: LinearGradient(
          colors: [
            Color(0xFFE8E3DC),
            Color(0xFFD4CFC7),
            Color(0xFFC4BEB5),
          ],
        ),
        border: Border(top: BorderSide(color: Color(0xFFB8B3AB))),
        boxShadow: AppShadows.button,
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            _NavItem(
              icon: Icons.chat_bubble_outline,
              label: "Chat",
              active: currentIndex == 0,
              onTap: () => onTap(0),
            ),
            _NavItem(
              icon: Icons.person_outline,
              label: "Profile",
              active: currentIndex == 1,
              onTap: () => onTap(1),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 22,
                color: active ? AppColors.textInk : AppColors.textPencil,
              ),
              const SizedBox(height: 4),
              Text(
                label.toUpperCase(),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: active ? AppColors.textInk : AppColors.textPencil,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                width: 24,
                height: 3,
                decoration: BoxDecoration(
                  color: active ? AppColors.brass : Colors.transparent,
                  borderRadius: BorderRadius.circular(1.5),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
