import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../models/message_model.dart';
import '../theme/app_theme.dart';

class DiagramCard extends StatefulWidget {
  final DiagramData diagram;
  const DiagramCard({super.key, required this.diagram});
  @override
  State<DiagramCard> createState() => _DiagramCardState();
}

class _DiagramCardState extends State<DiagramCard> {
  late final WebViewController _controller;
  bool _loaded = false;
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) => setState(() => _loaded = true),
      ))
      ..loadHtmlString(_buildHtml());
  }

  String _buildHtml() {
    final md = widget.diagram.markdown;

    // Check if there is a mermaid code block
    final mermaidStart = md.indexOf('```mermaid');
    final mermaidEnd = md.lastIndexOf('```');
    final hasMermaid = mermaidStart != -1 && mermaidEnd > mermaidStart;

    if (hasMermaid) {
      // Extract and render the mermaid block
      final mermaidCode = md.substring(mermaidStart + 10, mermaidEnd).trim();
      final escaped = mermaidCode
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;');

      return '''<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin:0; padding:12px; background:#FAF7F2;
    display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .mermaid svg { max-width:100% !important; height:auto !important; }
</style></head><body>
<div class="mermaid">$escaped</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>mermaid.initialize({startOnLoad:true,theme:'base',
  themeVariables:{primaryColor:'#FEF9C3',primaryTextColor:'#1C1917',
  primaryBorderColor:'#CA8A04',lineColor:'#78716C',fontSize:'13px'}});</script>
</body></html>''';
    }

    // No mermaid block — render as styled markdown/HTML
    // Convert markdown to simple HTML for display
    final htmlContent = md
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        // Headers
        .replaceAll(RegExp(r'^### (.+)$', multiLine: true), '<h3>\$1</h3>')
        .replaceAll(RegExp(r'^## (.+)$', multiLine: true), '<h2>\$1</h2>')
        .replaceAll(RegExp(r'^# (.+)$', multiLine: true), '<h1>\$1</h1>')
        // Bold
        .replaceAll(RegExp(r'\*\*(.+?)\*\*'), '<strong>\$1</strong>')
        // Inline code
        .replaceAll(RegExp(r'`([^`]+)`'), '<code>\$1</code>')
        // Code blocks — preserve as <pre>
        .replaceAll(
          RegExp(r'```[a-z]*\n?([\s\S]*?)```', multiLine: true),
          '<pre>\$1</pre>',
        )
        // Horizontal rule
        .replaceAll(RegExp(r'^---+$', multiLine: true), '<hr/>')
        // Table rows — basic support
        .replaceAll(RegExp(r'^\|(.+)\|$', multiLine: true), '<tr>\$1</tr>')
        // Newlines to <br>
        .replaceAll('\n', '<br/>');

    return '''<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    margin: 0; padding: 12px;
    background: #FAF7F2;
    font-family: -apple-system, sans-serif;
    font-size: 13px;
    color: #1C1917;
    line-height: 1.6;
  }
  h1 { font-size: 16px; color: #1C1917; margin: 12px 0 6px; }
  h2 { font-size: 15px; color: #1C1917; margin: 10px 0 5px; }
  h3 { font-size: 14px; color: #44403C; margin: 8px 0 4px; }
  strong { font-weight: 700; color: #1C1917; }
  code {
    background: #F0EBE3; color: #0D9488;
    padding: 1px 5px; border-radius: 3px;
    font-family: monospace; font-size: 12px;
    border: 1px solid #D6CFC4;
  }
  pre {
    background: #F0EBE3; padding: 10px; border-radius: 6px;
    font-family: monospace; font-size: 11px;
    overflow-x: auto; white-space: pre;
    border: 1px solid #D6CFC4; color: #1C1917;
    max-width: 100%;
  }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  tr { border-bottom: 1px solid #D6CFC4; }
  td, th {
    padding: 6px 8px; text-align: left;
    border: 1px solid #D6CFC4; font-size: 12px;
  }
  th { background: #F0EBE3; font-weight: 700; }
  hr { border: none; border-top: 1px solid #D6CFC4; margin: 12px 0; }
  blockquote {
    margin: 8px 0; padding: 6px 12px;
    border-left: 3px solid #CA8A04;
    background: rgba(202,138,4,0.06);
    color: #78716C; font-size: 12px;
  }
</style></head><body>
$htmlContent
</body></html>''';
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Header row with type badge + title + expand toggle
      Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: AppColors.brass.withOpacity(0.12),
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: AppColors.brass.withOpacity(0.3)),
          ),
          child: Text(
            '${widget.diagram.diagramType.toUpperCase()} DIAGRAM',
            style: const TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.w700,
              color: AppColors.brass,
              letterSpacing: 0.8,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            widget.diagram.title,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.textGraphite,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        GestureDetector(
          onTap: () => setState(() => _expanded = !_expanded),
          child: Icon(
            _expanded ? Icons.fullscreen_exit : Icons.fullscreen,
            size: 16,
            color: AppColors.textPencil,
          ),
        ),
      ]),
      const SizedBox(height: 8),
      AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        height: _expanded ? 400 : 200,
        decoration: BoxDecoration(
          color: AppColors.bgPaper,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: AppColors.borderStitch),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(children: [
          WebViewWidget(controller: _controller),
          if (!_loaded)
            const Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation(AppColors.brass),
              ),
            ),
        ]),
      ),
      if (widget.diagram.hasKBContext) ...[
        const SizedBox(height: 6),
        const Row(children: [
          Icon(Icons.verified_outlined, size: 11, color: AppColors.teal),
          SizedBox(width: 4),
          Text(
            'Based on panel documentation',
            style: TextStyle(fontSize: 10, color: AppColors.teal),
          ),
        ]),
      ],
    ]);
  }
}
