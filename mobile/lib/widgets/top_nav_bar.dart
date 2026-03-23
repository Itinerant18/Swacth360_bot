import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../providers/guest_provider.dart';
import '../providers/language_provider.dart';
import '../screens/auth/login_screen.dart';
import '../theme/app_theme.dart';

class TopNavBar extends StatelessWidget implements PreferredSizeWidget {
  final bool isAuth;
  final String userName;
  final bool showSaveButton;
  final bool sessionSaved;
  final VoidCallback? onSave;
  final VoidCallback? onProfileTap;

  const TopNavBar({
    super.key,
    this.isAuth = false,
    this.userName = '',
    this.showSaveButton = false,
    this.sessionSaved = false,
    this.onSave,
    this.onProfileTap,
  });

  @override
  Size get preferredSize => const Size.fromHeight(56.0);

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageProvider>();

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
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        child: Row(
          children: [
            if (isAuth) ...[
              Builder(
                builder: (ctx) => IconButton(
                  icon: const Icon(Icons.menu, color: AppColors.textGraphite),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () {
                    Scaffold.of(ctx).openDrawer();
                  },
                ),
              ),
              const SizedBox(width: 8),
            ],
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
            GestureDetector(
              onTap: () => _showLanguagePicker(context, lang),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.bgPaperInset,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.borderStitch),
                ),
                child: Text(
                  lang.language.shortCode,
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textInk,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            if (isAuth && showSaveButton) ...[
              IconButton(
                icon: Icon(
                  sessionSaved ? Icons.bookmark : Icons.bookmark_border,
                  color: sessionSaved ? AppColors.brass : AppColors.textGraphite,
                  size: 22,
                ),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
                onPressed: onSave,
              ),
              const SizedBox(width: 12),
            ],
            if (isAuth) ...[
              IconButton(
                icon: const Icon(Icons.person_outline, color: AppColors.textGraphite, size: 24),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
                onPressed: onProfileTap,
              ),
              const SizedBox(width: 8),
            ],
            isAuth
                ? IconButton(
                    icon: const Icon(Icons.logout, color: AppColors.textGraphite),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () async {
                      await context.read<AuthProvider>().signOut();
                      if (context.mounted) {
                        context.read<ChatProvider>().startNewConversation();
                        context.read<GuestProvider>().reset();
                      }
                    },
                  )
                : TextButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                      );
                    },
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

  void _showLanguagePicker(BuildContext context, LanguageProvider lang) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgPaper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(top: 8, bottom: 16),
              decoration: BoxDecoration(
                color: AppColors.borderStitch,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ...AppLanguage.values.map((l) => ListTile(
                  leading: Text(l.flag, style: const TextStyle(fontSize: 20)),
                  title: Text(l.nativeName,
                      style: const TextStyle(
                          fontSize: 14, color: AppColors.textInk)),
                  trailing: lang.language == l
                      ? const Icon(Icons.check, color: AppColors.brass, size: 18)
                      : null,
                  onTap: () {
                    lang.set(l);
                    Navigator.pop(context);
                  },
                )),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
