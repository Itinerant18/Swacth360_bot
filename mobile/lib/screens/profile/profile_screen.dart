import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/language_provider.dart';
import '../../theme/app_theme.dart';
import '../auth/login_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return auth.isAuthenticated
        ? _AuthedProfile(auth: auth)
        : _GuestProfile();
  }
}

// ── Authenticated Profile ────────────────────────────────────────────────────

class _AuthedProfile extends StatelessWidget {
  final AuthProvider auth;
  const _AuthedProfile({required this.auth});

  String get _initials {
    final parts = auth.userName.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return auth.userName.substring(0, auth.userName.length.clamp(1, 2)).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageProvider>();

    return Scaffold(
      backgroundColor: AppColors.bgDesk,
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Avatar card
          _Card(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: AppColors.brass,
                  child: Text(_initials, style: const TextStyle(
                    color: Colors.white, fontSize: 20,
                    fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(auth.userName, style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700,
                        color: AppColors.textInk)),
                      const SizedBox(height: 3),
                      Text(auth.user?.email ?? '', style: const TextStyle(
                        fontSize: 12, color: AppColors.textPencil)),
                      const SizedBox(height: 5),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.teal.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                              color: AppColors.teal.withOpacity(0.3)),
                        ),
                        child: const Text('VERIFIED',
                          style: TextStyle(fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: AppColors.teal,
                            letterSpacing: 0.8)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Language
          _SectionHeader('Preferences'),
          _Card(
            child: _SettingRow(
              icon: Icons.translate_rounded,
              title: 'Language',
              subtitle: lang.language.nativeName,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: AppLanguage.values.map((l) {
                  final active = lang.language == l;
                  return GestureDetector(
                    onTap: () => lang.set(l),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      margin: const EdgeInsets.only(left: 6),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 5),
                      decoration: BoxDecoration(
                        color: active
                            ? AppColors.brass.withOpacity(0.12)
                            : AppColors.bgPaperInset,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: active
                              ? AppColors.brass.withOpacity(0.4)
                              : AppColors.borderStitch,
                        ),
                      ),
                      child: Text(l.nativeName,
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: active
                                  ? FontWeight.w700
                                  : FontWeight.w400,
                              color: active
                                  ? AppColors.brass
                                  : AppColors.textPencil)),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          const SizedBox(height: 12),

          // About / App info
          _SectionHeader('About'),
          _Card(
            child: Column(
              children: [
                _SettingRow(
                  icon: Icons.info_outline_rounded,
                  title: 'App Version',
                  subtitle: AppConfig.appVersion,
                ),
                const Divider(height: 1),
                _SettingRow(
                  icon: Icons.devices_rounded,
                  title: 'Platform',
                  subtitle: 'Android & iOS',
                ),
                const Divider(height: 1),
                _SettingRow(
                  icon: Icons.dns_outlined,
                  title: 'Backend',
                  subtitle: AppConfig.apiBaseUrl,
                  subtitleMaxLines: 1,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Support
          _SectionHeader('Support'),
          _Card(
            child: Column(
              children: [
                _SettingRow(
                  icon: Icons.book_outlined,
                  title: 'Documentation',
                  subtitle: 'HMS panel manuals & guides',
                  onTap: () {},
                ),
                const Divider(height: 1),
                _SettingRow(
                  icon: Icons.bug_report_outlined,
                  title: 'Report an Issue',
                  subtitle: 'Send feedback to support',
                  onTap: () {},
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Sign out
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.logout_rounded, size: 16),
              label: const Text('SIGN OUT'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error),
                minimumSize: const Size.fromHeight(46),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () => _confirmSignOut(context),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  void _confirmSignOut(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgPaper,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                    color: AppColors.borderHover,
                    borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 20),
            const Icon(Icons.logout_rounded, size: 36, color: AppColors.error),
            const SizedBox(height: 12),
            const Text('Sign Out?', style: TextStyle(
                fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            const Text("You'll need to sign in again to access your history.",
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppColors.textPencil)),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(44),
                      side: const BorderSide(color: AppColors.borderStitch),
                    ),
                    child: const Text('Cancel',
                        style: TextStyle(color: AppColors.textGraphite)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () async {
                      Navigator.pop(context);
                      await context.read<AuthProvider>().signOut();
                      if (context.mounted) {
                        Navigator.of(context).pushAndRemoveUntil(
                          MaterialPageRoute(
                              builder: (_) => const LoginScreen()),
                          (r) => false,
                        );
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.error,
                      minimumSize: const Size.fromHeight(44),
                    ),
                    child: const Text('Sign Out'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Guest Profile ─────────────────────────────────────────────────────────────

class _GuestProfile extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgDesk,
      appBar: AppBar(title: const Text('Profile')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 72, height: 72,
                decoration: BoxDecoration(
                  color: AppColors.bgPaperInset,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.borderStitch),
                ),
                child: const Icon(Icons.person_outline_rounded,
                    size: 36, color: AppColors.textFaint),
              ),
              const SizedBox(height: 16),
              const Text('Guest User', style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w700,
                  color: AppColors.textInk)),
              const SizedBox(height: 6),
              const Text(
                'Sign in to save conversations, access history, and unlock all features.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppColors.textPencil,
                    height: 1.5)),
              const SizedBox(height: 28),
              ElevatedButton(
                onPressed: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const LoginScreen())),
                style: ElevatedButton.styleFrom(
                    minimumSize: const Size(180, 46)),
                child: const Text('SIGN IN'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Shared sub-widgets ────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader(this.title);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 4, 0, 8),
        child: Text(title.toUpperCase(), style: const TextStyle(
          fontSize: 10, fontWeight: FontWeight.w700,
          color: AppColors.textFaint, letterSpacing: 1.5)),
      );
}

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.bgPaper,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.borderStitch),
          boxShadow: [BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 6, offset: const Offset(0, 2))],
        ),
        child: child,
      );
}

class _SettingRow extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final int subtitleMaxLines;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _SettingRow({
    required this.icon, required this.title, required this.subtitle,
    this.trailing, this.onTap, this.subtitleMaxLines = 1,
  });

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              Icon(icon, size: 18, color: AppColors.brass),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600,
                      color: AppColors.textInk)),
                    Text(subtitle, maxLines: subtitleMaxLines,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.textPencil)),
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: 8),
                trailing!,
              ] else if (onTap != null)
                const Icon(Icons.chevron_right_rounded,
                    size: 16, color: AppColors.textFaint),
            ],
          ),
        ),
      );
}