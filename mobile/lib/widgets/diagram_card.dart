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
    String mermaidCode = '';
    final start = md.indexOf('```mermaid');
    final end = md.lastIndexOf('```');
    if (start != -1 && end > start) {
      mermaidCode = md.substring(start + 10, end).trim();
    } else {
      mermaidCode = md.trim();
    }
    // Escape for HTML
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
              fontSize: 9,
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
              fontSize: 12,
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
            size: 18,
            color: AppColors.textPencil,
          ),
        ),
      ]),
      const SizedBox(height: 8),
      AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        height: _expanded ? 420 : 220,
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
