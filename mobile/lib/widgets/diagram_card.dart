import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../models/message_model.dart';
import '../theme/app_theme.dart';

class DiagramCard extends StatefulWidget {
  final DiagramData data;
  const DiagramCard({super.key, required this.data});

  @override
  State<DiagramCard> createState() => _DiagramCardState();
}

class _DiagramCardState extends State<DiagramCard> {
  late final WebViewController _controller;
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
        onWebResourceError: (_) {
          if (mounted) {
            setState(() {
              _loading = false;
              _error = true;
            });
          }
        },
      ))
      ..loadHtmlString(_buildHtml());
  }

  String _buildHtml() {
    final mermaidCode = widget.data.markdown
        .replaceAll('```mermaid', '')
        .replaceAll('```', '')
        .trim();

    return '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 16px;
      background: #FAF7F2;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .mermaid {
      width: 100%;
    }
    .error {
      color: #DC2626;
      font-size: 13px;
      padding: 16px;
    }
    pre {
      background: #F0EBE3;
      padding: 12px;
      border-radius: 8px;
      font-size: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
      color: #44403C;
    }
  </style>
</head>
<body>
  <div class="mermaid">
$mermaidCode
  </div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'neutral',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    });
    mermaid.init(undefined, '.mermaid').catch(function(e) {
      document.querySelector('.mermaid').innerHTML =
        '<div class="error">Diagram render error</div><pre>' +
        document.querySelector('.mermaid').textContent + '</pre>';
    });
  </script>
</body>
</html>
''';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.data.title.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              widget.data.title,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.textInk,
              ),
            ),
          ),
        Container(
          height: 300,
          decoration: BoxDecoration(
            color: AppColors.bgPaper,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.borderStitch),
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              if (!_error)
                WebViewWidget(controller: _controller)
              else
                _FallbackView(markdown: widget.data.markdown),
              if (_loading)
                const Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation(AppColors.brass),
                  ),
                ),
            ],
          ),
        ),
        if (widget.data.panelType.isNotEmpty || widget.data.diagramType.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(
              children: [
                if (widget.data.panelType.isNotEmpty)
                  _Tag(widget.data.panelType),
                if (widget.data.diagramType.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  _Tag(widget.data.diagramType),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _Tag extends StatelessWidget {
  final String label;
  const _Tag(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.brass.withOpacity(0.08),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.brass.withOpacity(0.2)),
      ),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: AppColors.brass,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _FallbackView extends StatelessWidget {
  final String markdown;
  const _FallbackView({required this.markdown});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.warning_amber_rounded, size: 14, color: AppColors.warning),
              SizedBox(width: 4),
              Text(
                'Diagram preview unavailable offline',
                style: TextStyle(
                  fontSize: 11,
                  color: AppColors.warning,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.bgPaperInset,
              borderRadius: BorderRadius.circular(8),
            ),
            child: SelectableText(
              markdown,
              style: const TextStyle(
                fontSize: 11,
                fontFamily: 'monospace',
                color: AppColors.textGraphite,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
