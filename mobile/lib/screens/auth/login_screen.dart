import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/auth_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/auth_card.dart';
import '../../widgets/auth_input_field.dart';
import '../../widgets/dark_button.dart';
import '../../widgets/error_banner.dart';
import '../../widgets/paper_background.dart';
import '../home_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  int tab = 0;
  String? error;
  bool isLoading = false;
  String? _resendStatus; // null | 'sending' | 'sent' | 'error'

  late final AnimationController _cardAnimCtrl;
  late final Animation<double> _cardFade;
  late final Animation<Offset> _cardSlide;

  @override
  void initState() {
    super.initState();
    _cardAnimCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _cardFade =
        CurvedAnimation(parent: _cardAnimCtrl, curve: Curves.easeOut);
    _cardSlide = Tween<Offset>(
      begin: const Offset(0, 0.08),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _cardAnimCtrl, curve: Curves.easeOut));
    _cardAnimCtrl.forward();
  }

  Future<void> _resendConfirmation() async {
    if (_emailCtrl.text.isEmpty) return;
    setState(() => _resendStatus = 'sending');
    try {
      await Supabase.instance.client.auth.resend(
        type: OtpType.signup,
        email: _emailCtrl.text.trim().toLowerCase(),
      );
      if (mounted) setState(() => _resendStatus = 'sent');
    } catch (_) {
      if (mounted) setState(() => _resendStatus = 'error');
    }
  }

  // Sign in controllers
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();

  // Register controllers
  final _rNameCtrl = TextEditingController();
  final _rPhoneCtrl = TextEditingController();
  final _rEmailCtrl = TextEditingController();
  final _rPassCtrl = TextEditingController();
  final _rConfirmCtrl = TextEditingController();

  @override
  void dispose() {
    _cardAnimCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _rNameCtrl.dispose();
    _rPhoneCtrl.dispose();
    _rEmailCtrl.dispose();
    _rPassCtrl.dispose();
    _rConfirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    final email = _emailCtrl.text.trim().toLowerCase();
    final password = _passCtrl.text; // do NOT trim password

    if (email.isEmpty || password.isEmpty) {
      setState(() => error = 'Please fill in all fields.');
      return;
    }

    // ── Admin account block ────────────────────────
    if (email == 'aniket.karmakar@seple.in') {
      _showAdminBlockModal();
      _emailCtrl.clear();
      _passCtrl.clear();
      return;
    }
    // ──────────────────────────────────────────────

    setState(() {
      isLoading = true;
      error = null;
      _resendStatus = null;
    });

    final auth = context.read<AuthProvider>();
    final ok = await auth.signIn(email: email, password: password);

    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pushAndRemoveUntil(
        PageRouteBuilder(
          transitionDuration: const Duration(milliseconds: 300),
          pageBuilder: (_, __, ___) => const HomeScreen(),
          transitionsBuilder: (_, animation, __, child) {
            return FadeTransition(
              opacity: animation,
              child: SlideTransition(
                position: Tween<Offset>(
                  begin: const Offset(0, 0.05),
                  end: Offset.zero,
                ).animate(CurvedAnimation(
                  parent: animation,
                  curve: Curves.easeOutCubic,
                )),
                child: child,
              ),
            );
          },
        ),
        (r) => false,
      );
    } else {
      setState(() {
        isLoading = false;
        error = auth.error;
      });
    }
  }

  Future<void> _register() async {
    if (_rEmailCtrl.text.trim().isEmpty || _rPassCtrl.text.isEmpty) {
      setState(() => error = 'Please fill in all fields.');
      return;
    }
    if (_rPassCtrl.text != _rConfirmCtrl.text) {
      setState(() => error = 'Passwords do not match.');
      return;
    }
    setState(() {
      isLoading = true;
      error = null;
    });

    final auth = context.read<AuthProvider>();
    final ok = await auth.signUp(
      email: _rEmailCtrl.text.trim(),
      password: _rPassCtrl.text,
      fullName: _rNameCtrl.text.trim(),
    );

    if (!mounted) return;
    if (ok) {
      setState(() {
        isLoading = false;
        error = null;
        tab = 0;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Account created! Check your email to confirm.'),
      ));
    } else {
      setState(() {
        isLoading = false;
        error = auth.error;
      });
    }
  }

  Future<void> _forgotPassword() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      setState(() => error = 'Enter your email first.');
      return;
    }
    try {
      await AuthService().resetPassword(email);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password reset email sent.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password reset email sent.')),
      );
    }
  }

  void _showAdminBlockModal() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgPaper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.borderStitch,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: AppColors.warning.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.warning.withOpacity(0.3),
                ),
              ),
              child: const Icon(
                Icons.admin_panel_settings_outlined,
                size: 28,
                color: AppColors.warning,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Admin Account Detected',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.textInk,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'The admin dashboard is only accessible via the web browser.\n\nPlease visit sai.seple.in on your computer to access the admin panel.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: AppColors.textPencil,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.textInk,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text(
                  'GOT IT',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.0,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PaperBackground(
        child: Center(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0),
              child: FadeTransition(
                opacity: _cardFade,
                child: SlideTransition(
                  position: _cardSlide,
                  child: AuthCard(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Logo row
                        Row(
                          children: [
                            Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: AppColors.brass,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Center(
                                child: Text(
                                  'S',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Container(
                              width: 1,
                              height: 28,
                              color: AppColors.borderStitch,
                            ),
                            const SizedBox(width: 14),
                            const Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'SAI',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.textInk,
                                    letterSpacing: 1.0,
                                  ),
                                ),
                                Text(
                                  'SWATCH PANEL SUPPORT',
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w500,
                                    color: AppColors.textPencil,
                                    letterSpacing: 1.2,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 28),

                        // Tabs
                        Row(
                          children: [
                            _Tab(
                              label: "Sign In",
                              active: tab == 0,
                              onTap: () => setState(() {
                                tab = 0;
                                error = null;
                              }),
                            ),
                            _Tab(
                              label: "Register",
                              active: tab == 1,
                              onTap: () => setState(() {
                                tab = 1;
                                error = null;
                              }),
                            ),
                          ],
                        ),
                        Container(
                            height: 1, color: AppColors.borderStitch),
                        const SizedBox(height: 24),

                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 250),
                          child: tab == 0
                              ? _buildSignInForm()
                              : _buildRegisterForm(),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSignInForm() {
    return Column(
      key: const ValueKey('signin'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          "EMAIL",
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: AppColors.textPencil,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 6),
        AuthInputField(
          hint: "you@example.com",
          type: TextInputType.emailAddress,
          controller: _emailCtrl,
        ),
        const SizedBox(height: 16),
        const Text(
          "PASSWORD",
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: AppColors.textPencil,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 6),
        AuthInputField(
          hint: "••••••••",
          isPassword: true,
          controller: _passCtrl,
        ),
        const SizedBox(height: 6),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: _forgotPassword,
            style: TextButton.styleFrom(
              padding: EdgeInsets.zero,
              minimumSize: const Size(0, 0),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text(
              "Forgot password?",
              style: TextStyle(
                fontSize: 11,
                color: AppColors.brass,
                fontFamily: 'monospace',
                decoration: TextDecoration.underline,
                decorationColor: AppColors.brass,
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: error != null
              ? Container(
                  key: const ValueKey('error'),
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.danger.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(8),
                    border:
                        Border.all(color: AppColors.danger.withOpacity(0.25)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        const Icon(Icons.error_outline,
                            size: 14, color: AppColors.danger),
                        const SizedBox(width: 8),
                        Expanded(
                            child: Text(error!,
                                style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.danger))),
                      ]),
                      if (error!.toLowerCase().contains('confirm')) ...[
                        const SizedBox(height: 10),
                        GestureDetector(
                          onTap: _resendConfirmation,
                          child: Text(
                            _resendStatus == 'sent'
                                ? 'Confirmation email sent. Check your inbox.'
                                : _resendStatus == 'sending'
                                    ? 'Sending...'
                                    : 'Resend confirmation email',
                            style: TextStyle(
                              fontSize: 11,
                              color: _resendStatus == 'sent'
                                  ? AppColors.teal
                                  : AppColors.brass,
                              decoration: _resendStatus == null
                                  ? TextDecoration.underline
                                  : null,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                )
              : const SizedBox.shrink(key: ValueKey('no-error')),
        ),
        DarkButton(
          label: "Sign In",
          onPressed: _signIn,
          isLoading: isLoading,
        ),
        const SizedBox(height: 20),
        Container(
            height: 1,
            color: AppColors.borderStitch.withOpacity(0.5)),
        const SizedBox(height: 14),
        Center(
          child: RichText(
            text: TextSpan(
              text: "No account yet? ",
              style: const TextStyle(
                  fontSize: 12, color: AppColors.textGraphite),
              children: [
                TextSpan(
                  text: "Register here",
                  style: const TextStyle(
                    color: AppColors.brass,
                    decoration: TextDecoration.underline,
                    decorationColor: AppColors.brass,
                  ),
                  recognizer: TapGestureRecognizer()
                    ..onTap = () => setState(() {
                          tab = 1;
                          error = null;
                        }),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRegisterForm() {
    return Column(
      key: const ValueKey('register'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: AuthInputField(
                hint: "Full Name",
                controller: _rNameCtrl,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AuthInputField(
                hint: "Phone",
                type: TextInputType.phone,
                controller: _rPhoneCtrl,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        AuthInputField(
          hint: "Email",
          type: TextInputType.emailAddress,
          controller: _rEmailCtrl,
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: AuthInputField(
                hint: "min 8 chars",
                isPassword: true,
                controller: _rPassCtrl,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AuthInputField(
                hint: "repeat",
                isPassword: true,
                controller: _rConfirmCtrl,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: error != null
              ? Padding(
                  key: const ValueKey('reg-error'),
                  padding: const EdgeInsets.only(bottom: 12.0),
                  child: ErrorBanner(error: error!),
                )
              : const SizedBox.shrink(key: ValueKey('no-reg-error')),
        ),
        DarkButton(
          label: "Create Account",
          onPressed: _register,
          isLoading: isLoading,
        ),
        const SizedBox(height: 16),
        Center(
          child: RichText(
            text: TextSpan(
              text: "Already have an account? ",
              style: const TextStyle(
                  fontSize: 12, color: AppColors.textGraphite),
              children: [
                TextSpan(
                  text: "Sign in here",
                  style: const TextStyle(
                    color: AppColors.brass,
                    decoration: TextDecoration.underline,
                    decorationColor: AppColors.brass,
                  ),
                  recognizer: TapGestureRecognizer()
                    ..onTap = () => setState(() {
                          tab = 0;
                          error = null;
                        }),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Tab extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _Tab({
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
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text(
                label.toUpperCase(),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  color:
                      active ? AppColors.textInk : AppColors.textFaint,
                  letterSpacing: 0.96,
                ),
              ),
            ),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              height: 2,
              color: active ? AppColors.brass : Colors.transparent,
            ),
          ],
        ),
      ),
    );
  }
}
