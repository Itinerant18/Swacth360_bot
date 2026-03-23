import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';
import '../../providers/guest_provider.dart';
import '../../providers/language_provider.dart';
import '../../theme/app_theme.dart';
import '../auth/login_screen.dart';

class ProfileModal extends StatelessWidget {
  const ProfileModal({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bgPaper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => const ProfileModal(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final lang = context.watch<LanguageProvider>();

    String initials = 'G';
    String displayName = 'Guest';
    String email = '';
    if (auth.isAuthenticated) {
      displayName = auth.userName;
      email = auth.user?.email ?? '';
      final parts = displayName.trim().split(' ');
      if (parts.length >= 2) {
        initials = '${parts[0][0]}${parts[1][0]}'.toUpperCase();
      } else if (displayName.isNotEmpty) {
        initials = displayName[0].toUpperCase();
      }
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollController) {
        return Column(
          children: [
            // Handle and Close
            Container(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const SizedBox(width: 48), // Padding balancer
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.borderStitch,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: AppColors.textGraphite),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                controller: scrollController,
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                children: [
                  // Avatar Section
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.bgWhite,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.borderStitch),
                      boxShadow: AppShadows.card,
                    ),
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 28,
                          backgroundColor: auth.isAuthenticated
                              ? AppColors.brass
                              : AppColors.textGraphite,
                          child: Text(
                            initials,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                displayName,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textInk,
                                ),
                              ),
                              if (email.isNotEmpty)
                                Text(
                                  email,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textPencil,
                                  ),
                                ),
                              if (auth.isAuthenticated) ...[
                                const SizedBox(height: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.teal.withOpacity(0.1),
                                    border: Border.all(color: AppColors.teal),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    "VERIFIED",
                                    style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.teal,
                                    ),
                                  ),
                                ),
                              ],
                              if (!auth.isAuthenticated) ...[
                                const SizedBox(height: 8),
                                GestureDetector(
                                  onTap: () {
                                    Navigator.pop(context);
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(builder: (_) => const LoginScreen()),
                                    );
                                  },
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: AppColors.brass.withOpacity(0.1),
                                      border: Border.all(color: AppColors.brass),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: const Text(
                                      "SIGN IN",
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.brass,
                                        letterSpacing: 0.8,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  const _SectionHeader("PREFERENCES"),
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.bgWhite,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.borderStitch),
                      boxShadow: AppShadows.card,
                    ),
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          "Language",
                          style: TextStyle(fontSize: 14, color: AppColors.textInk),
                        ),
                        Row(
                          children: AppLanguage.values.map((l) => Padding(
                                padding: const EdgeInsets.only(left: 8),
                                child: _LangPill(
                                  label: l == AppLanguage.en ? 'EN' : l.nativeName,
                                  active: lang.language == l,
                                  onTap: () => lang.set(l),
                                ),
                              )).toList(),
                        ),
                      ],
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  const _SectionHeader("ABOUT"),
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.bgWhite,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.borderStitch),
                      boxShadow: AppShadows.card,
                    ),
                    child: Column(
                      children: [
                        _InfoRow("Version", AppConfig.appVersion),
                        const Divider(height: 1, thickness: 1, color: AppColors.borderStitch),
                        const _InfoRow("Platform", "Cross-Platform"),
                      ],
                    ),
                  ),
                  
                  const SizedBox(height: 32),
                  
                  // Sign out button for authenticated users
                  if (auth.isAuthenticated)
                    Container(
                      width: double.infinity,
                      height: 48,
                      margin: const EdgeInsets.only(bottom: 24),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.danger, width: 1.5),
                      ),
                      child: TextButton(
                        onPressed: () => _showSignOutConfirmation(context),
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.danger,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.logout, size: 18, color: AppColors.danger),
                            SizedBox(width: 8),
                            Text(
                              "SIGN OUT",
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.0,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  void _showSignOutConfirmation(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: AppColors.bgPaper,
          title: const Text("Sign Out", style: TextStyle(color: AppColors.textInk, fontWeight: FontWeight.w700)),
          content: const Text("Are you sure you want to sign out?", style: TextStyle(color: AppColors.textGraphite)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text("Cancel", style: TextStyle(color: AppColors.textPencil)),
            ),
            TextButton(
              onPressed: () async {
                Navigator.pop(ctx);
                Navigator.pop(context); // close modal
                await context.read<AuthProvider>().signOut();
                if (context.mounted) {
                  context.read<ChatProvider>().startNewConversation();
                  context.read<GuestProvider>().reset();
                }
              },
              child: const Text("Sign Out", style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
            ),
          ],
        );
      },
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader(this.title);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 0, 8),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppColors.textFaint,
          letterSpacing: 1.5,
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String title;
  final String value;
  const _InfoRow(this.title, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: const TextStyle(fontSize: 14, color: AppColors.textInk)),
          Text(value, style: const TextStyle(fontSize: 14, color: AppColors.textPencil)),
        ],
      ),
    );
  }
}

class _LangPill extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _LangPill({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: active ? AppColors.brass.withOpacity(0.12) : AppColors.bgPaperInset,
          border: Border.all(
            color: active ? AppColors.brass : AppColors.borderStitch,
            width: active ? 1.5 : 1.0,
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: active ? FontWeight.w700 : FontWeight.normal,
            color: active ? AppColors.brass : AppColors.textPencil,
          ),
        ),
      ),
    );
  }
}
