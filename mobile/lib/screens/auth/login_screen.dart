import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../widgets/auth_card.dart';
import '../../widgets/auth_input_field.dart';
import '../../widgets/dark_button.dart';
import '../../widgets/error_banner.dart';
import '../../widgets/paper_background.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  int tab = 0; // 0 for Sign In, 1 for Register
  String? error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PaperBackground(
        child: Center(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0),
              child: AuthCard(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Logo row
                    Row(
                      children: [
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
                        const SizedBox(width: 14),
                        Container(
                          width: 1,
                          height: 28,
                          color: AppColors.borderStitch,
                        ),
                        const SizedBox(width: 14),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'SAI',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textInk,
                                letterSpacing: 0.8, // Approx 0.05em * 16
                              ),
                            ),
                            const Text(
                              'SWATCH PANEL SUPPORT',
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w500,
                                color: AppColors.textPencil,
                                letterSpacing: 0.9, // Approx 0.10em * 9
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
                          onTap: () => setState(() => tab = 0),
                        ),
                        _Tab(
                          label: "Register",
                          active: tab == 1,
                          onTap: () => setState(() => tab = 1),
                        ),
                      ],
                    ),
                    Container(height: 1, color: AppColors.borderStitch),
                    const SizedBox(height: 24),

                    if (tab == 0) _buildSignInForm() else _buildRegisterForm(),
                  ],
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
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          "EMAIL",
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: AppColors.textPencil,
            letterSpacing: 1.2, // Approx 0.12em
          ),
        ),
        const SizedBox(height: 6),
        const AuthInputField(
          hint: "you@example.com",
          type: TextInputType.emailAddress,
        ),
        const SizedBox(height: 14),
        const Text(
          "PASSWORD",
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: AppColors.textPencil,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 6),
        const AuthInputField(
          hint: "••••••••",
          isPassword: true,
        ),
        const SizedBox(height: 6),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () {},
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
        const SizedBox(height: 6),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12.0),
            child: ErrorBanner(error: error!),
          ),
        const DarkButton(label: "Sign In"),
        const SizedBox(height: 20),
        Container(height: 1, color: AppColors.borderStitch.withOpacity(0.5)),
        const SizedBox(height: 14),
        Center(
          child: RichText(
            text: const TextSpan(
              text: "No account yet? ",
              style: TextStyle(fontSize: 12, color: AppColors.textGraphite),
              children: [
                TextSpan(
                  text: "Register here",
                  style: TextStyle(
                    color: AppColors.brass,
                    decoration: TextDecoration.underline,
                    decorationColor: AppColors.brass,
                  ),
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
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Row(
          children: [
            Expanded(child: AuthInputField(hint: "Full Name")),
            SizedBox(width: 12),
            Expanded(child: AuthInputField(hint: "Phone", type: TextInputType.phone)),
          ],
        ),
        const SizedBox(height: 14),
        const AuthInputField(hint: "Email", type: TextInputType.emailAddress),
        const SizedBox(height: 14),
        const Row(
          children: [
            Expanded(child: AuthInputField(hint: "min 8 chars", isPassword: true)),
            SizedBox(width: 12),
            Expanded(child: AuthInputField(hint: "repeat", isPassword: true)),
          ],
        ),
        const SizedBox(height: 6),
        const DarkButton(label: "Create Account"),
        const SizedBox(height: 16),
        Center(
          child: RichText(
            text: const TextSpan(
              text: "Already have an account? ",
              style: TextStyle(fontSize: 12, color: AppColors.textGraphite),
              children: [
                TextSpan(
                  text: "Sign in here",
                  style: TextStyle(
                    color: AppColors.brass,
                  ),
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
                  fontWeight: FontWeight.w700,
                  color: active ? AppColors.textInk : AppColors.textPencil,
                  letterSpacing: 0.96, // Approx 0.08em * 12
                ),
              ),
            ),
            Container(
              height: 2,
              color: active ? AppColors.brass : Colors.transparent,
            ),
          ],
        ),
      ),
    );
  }
}
