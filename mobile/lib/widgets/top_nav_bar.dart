import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class TopNavBar extends StatelessWidget implements PreferredSizeWidget {
  final bool isAuth;
  final String userName;

  const TopNavBar({
    super.key,
    this.isAuth = false,
    this.userName = '',
  });

  @override
  Size get preferredSize => const Size.fromHeight(56.0);

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56 + MediaQuery.of(context).padding.top,
      padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFFE8E3DC),
            Color(0xFFD4CFC7),
            Color(0xFFC4BEB5),
          ],
        ),
        border: Border(bottom: BorderSide(color: Color(0xFFB8B3AB))),
        boxShadow: [
          // Flutter doesn't fully support inner shadows natively in BoxShadow without third-party pkgs.
          BoxShadow(
            color: Color(0x14000000), // 0.08 alpha
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.menu, color: AppColors.textGraphite),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              onPressed: () {
                Scaffold.of(context).openDrawer();
              },
            ),
            const SizedBox(width: 8),
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.brass,
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Center(
                child: Text(
                  'S',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'SAI AI',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textInk,
                  ),
                ),
                Text(
                  isAuth ? 'Hi, $userName' : 'Guest session',
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.textPencil,
                  ),
                ),
              ],
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.bgPaperInset,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.borderStitch),
              ),
              child: const Text('EN', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.textInk)),
            ),
            const SizedBox(width: 12),
            isAuth
                ? IconButton(
                    icon: const Icon(Icons.logout, color: AppColors.textGraphite),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () {},
                  )
                : TextButton(
                    onPressed: () {},
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: const Size(0, 0),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text(
                      'SIGN IN',
                      style: TextStyle(
                        color: AppColors.brass,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
          ],
        ),
      ),
    );
  }
}
