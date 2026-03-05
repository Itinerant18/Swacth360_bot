"""
scripts/langextract-ingest.py

LangExtract Pre-Processing Pipeline for HMS/Dexter Technical Manuals

WHY THIS EXISTS:
  The existing ingest-pdf.ts uses a single-pass 800-char chunker + Sarvam Q&A.
  For dense HMS technical manuals, this misses:
    - Error codes buried in appendices
    - Wiring specs in tables
    - Installation steps scattered across sections
    - Component ratings hidden in footnotes

  LangExtract fixes this with:
    ✅ Multi-pass extraction (3 independent passes, merged by "first-pass wins")
    ✅ Parallel processing of chunks
    ✅ Precise source grounding (extracted entity → exact text location)
    ✅ Schema-enforced structured output (no hallucinated fields)
    ✅ Already uses Gemini API (same key you have)

HOW IT FITS INTO YOUR PIPELINE:
  This script is a PRE-PROCESSOR. It runs BEFORE Node.js ingest:

  PDF file
    │
    ├── [THIS SCRIPT] LangExtract → structured JSONL file (entities + source locations)
    │
    └── [EXISTING] ingest-pdf.ts still runs for text chunks
         (both pipelines complement each other — different extraction strategies)

  After this script, run:
    npx tsx scripts/ingest-jsonl.ts --file="output.jsonl" --name="Manual v2.3"

  Or pass the JSONL directly to your existing Supabase seeder.

USAGE:
  pip install langextract google-generativeai
  python scripts/langextract-ingest.py --file "data/pdf/manual.pdf" --name "Anybus Manual v2.3"
  python scripts/langextract-ingest.py --file "data/pdf/guide.pdf" --name "HMS Guide" --passes 3 --workers 4

OUTPUT:
  Writes: data/langextract/<source_name>_extracted.jsonl
  Each line is one extracted entity ready for embedding.

REQUIREMENTS:
  pip install langextract google-generativeai python-dotenv
  GEMINI_API_KEY must be set in .env
"""

import os
import sys
import json
import argparse
import textwrap
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent / ".env.local")

try:
    import langextract as lx
except ImportError:
    print("❌ LangExtract not installed. Run: pip install langextract google-generativeai")
    sys.exit(1)

# ─── HMS-Specific Extraction Prompts ──────────────────────────
#
# LangExtract uses "few-shot" examples to define WHAT to extract.
# We define 5 extraction classes tuned for HMS technical manuals:
#
#  1. ErrorCode        — error/fault codes with cause and resolution
#  2. WiringSpec       — terminal connections, wire colors, pin numbers
#  3. TechnicalParam   — measurable specs (voltage, current, distance, baudrate)
#  4. Procedure        — numbered installation/configuration/troubleshooting steps
#  5. ComponentSpec    — device specs (model, rating, function, compatibility)
#
# Each class has "attributes" — structured sub-fields LangExtract extracts per entity.

HMS_PROMPT = textwrap.dedent("""
    Extract all technical information from this HMS industrial panel manual.
    Focus on information a field engineer or technician would need on-site.

    Extract 5 types of entities:

    1. ErrorCode — any error code, fault code, or alarm code with its meaning
       Attributes: code (exact code string), description (what it means),
       probable_cause (why it occurs), resolution (how to fix it)

    2. WiringSpec — any terminal, connector, pin, or wiring instruction
       Attributes: terminal_label (e.g. "A+", "TB1", "Pin 3"), signal_type
       (e.g. "RS-485 A", "24VDC", "GND"), wire_color (if mentioned),
       connected_to (what it connects to), voltage_level (if mentioned)

    3. TechnicalParam — measurable technical parameter or specification
       Attributes: parameter_name (e.g. "Supply Voltage"), value (e.g. "24V DC"),
       min_value, max_value, unit (e.g. "V", "A", "m", "bps"), tolerance,
       applies_to (which component or system this spec belongs to)

    4. Procedure — a numbered or sequential procedure (installation, config, troubleshooting)
       Attributes: step_number, action (what to do), component (what device/part),
       expected_result (what should happen), warning (any safety note)

    5. ComponentSpec — a named component or module with its specifications
       Attributes: component_name, model_number, function (what it does),
       input_spec, output_spec, communication_protocol, compatible_with
""")

HMS_EXAMPLES = [
    lx.data.ExampleData(
        text=textwrap.dedent("""
            Error E001: Communication Timeout
            Cause: The slave device is not responding within 500ms.
            Resolution: Check RS-485 cable polarity. Ensure A+ is connected to A+ 
            and B- to B- on both master and slave. Verify baud rate matches (default 9600).
        """),
        extractions=[
            lx.data.ExtractionData(
                extraction_class="ErrorCode",
                extraction_text="E001: Communication Timeout",
                attributes={
                    "code": "E001",
                    "description": "Communication Timeout",
                    "probable_cause": "Slave device not responding within 500ms",
                    "resolution": "Check RS-485 cable polarity and baud rate"
                }
            ),
            lx.data.ExtractionData(
                extraction_class="WiringSpec",
                extraction_text="A+ is connected to A+ and B- to B-",
                attributes={
                    "terminal_label": "A+",
                    "signal_type": "RS-485 A",
                    "connected_to": "RS-485 A+ on slave device",
                    "voltage_level": "differential"
                }
            ),
            lx.data.ExtractionData(
                extraction_class="TechnicalParam",
                extraction_text="baud rate matches (default 9600)",
                attributes={
                    "parameter_name": "RS-485 Baud Rate",
                    "value": "9600",
                    "unit": "bps",
                    "applies_to": "RS-485 communication"
                }
            ),
        ]
    ),
    lx.data.ExampleData(
        text=textwrap.dedent("""
            3.4 Power Supply Installation

            Step 1: Disconnect all power before installation.
            Step 2: Connect 24V DC to terminal TB1+ and GND to TB1-.
                    Supply must be between 18V DC and 30V DC. Do not exceed 30V.
            Step 3: Mount the panel on DIN rail. Apply 35N force minimum.
            Step 4: Power on and verify LED D1 (green) lights up within 2 seconds.

            Anybus X-gateway: Model ABC-1234
            Supports: PROFIBUS DP-V1 (slave), Modbus TCP (master)
            Supply: 24V DC ±20%, max 150mA
        """),
        extractions=[
            lx.data.ExtractionData(
                extraction_class="Procedure",
                extraction_text="Step 1: Disconnect all power before installation.",
                attributes={
                    "step_number": "1",
                    "action": "Disconnect all power before installation",
                    "component": "Power supply",
                    "expected_result": "System is de-energized",
                    "warning": "Safety: De-energize before working"
                }
            ),
            lx.data.ExtractionData(
                extraction_class="WiringSpec",
                extraction_text="Connect 24V DC to terminal TB1+ and GND to TB1-",
                attributes={
                    "terminal_label": "TB1+",
                    "signal_type": "24V DC Power",
                    "connected_to": "24V DC positive supply",
                    "voltage_level": "24V DC"
                }
            ),
            lx.data.ExtractionData(
                extraction_class="TechnicalParam",
                extraction_text="Supply must be between 18V DC and 30V DC",
                attributes={
                    "parameter_name": "Supply Voltage",
                    "value": "24V DC",
                    "min_value": "18",
                    "max_value": "30",
                    "unit": "V DC",
                    "applies_to": "X-gateway power input"
                }
            ),
            lx.data.ExtractionData(
                extraction_class="ComponentSpec",
                extraction_text="Anybus X-gateway: Model ABC-1234",
                attributes={
                    "component_name": "Anybus X-gateway",
                    "model_number": "ABC-1234",
                    "function": "Protocol converter between PROFIBUS DP-V1 and Modbus TCP",
                    "input_spec": "24V DC ±20%, max 150mA",
                    "communication_protocol": "PROFIBUS DP-V1, Modbus TCP"
                }
            ),
        ]
    ),
]

# ─── Convert LangExtract output to HMS Knowledge JSONL ────────

def entity_to_knowledge_entry(entity, source_name: str, idx: int) -> dict:
    """
    Convert one LangExtract extracted entity to a record compatible
    with the hms_knowledge table schema.

    The 'content' field is rich text for OpenAI embedding (same format as
    seed-supabase.ts buildEmbeddingText).
    """
    attrs = entity.attributes or {}
    cls = entity.extraction_class
    text = entity.extraction_text

    # Build Q&A from entity type
    if cls == "ErrorCode":
        question = f"What does {attrs.get('code', 'this error')} mean in the HMS panel?"
        answer_parts = [f"Error Code: {attrs.get('code', 'N/A')}"]
        if attrs.get('description'): answer_parts.append(f"Meaning: {attrs['description']}")
        if attrs.get('probable_cause'): answer_parts.append(f"Cause: {attrs['probable_cause']}")
        if attrs.get('resolution'): answer_parts.append(f"Resolution: {attrs['resolution']}")
        answer = " | ".join(answer_parts)
        category = "Troubleshooting & Diagnostics"
        subcategory = "Error Codes"
        tags = ["error code", attrs.get('code', '').lower(), "fault", "alarm"]

    elif cls == "WiringSpec":
        terminal = attrs.get('terminal_label', 'terminal')
        question = f"How do I wire the {terminal} terminal on the HMS panel?"
        answer_parts = [f"Terminal {terminal}"]
        if attrs.get('signal_type'): answer_parts.append(f"Signal: {attrs['signal_type']}")
        if attrs.get('wire_color'): answer_parts.append(f"Wire color: {attrs['wire_color']}")
        if attrs.get('connected_to'): answer_parts.append(f"Connect to: {attrs['connected_to']}")
        if attrs.get('voltage_level'): answer_parts.append(f"Voltage: {attrs['voltage_level']}")
        answer = " | ".join(answer_parts)
        category = "Installation & Commissioning"
        subcategory = "Wiring & Connections"
        tags = ["wiring", "terminal", terminal.lower(), "connection"]

    elif cls == "TechnicalParam":
        param = attrs.get('parameter_name', 'parameter')
        question = f"What is the {param} specification for the HMS panel?"
        val = attrs.get('value', 'N/A')
        unit = attrs.get('unit', '')
        answer_parts = [f"{param}: {val} {unit}".strip()]
        if attrs.get('min_value'): answer_parts.append(f"Min: {attrs['min_value']} {unit}".strip())
        if attrs.get('max_value'): answer_parts.append(f"Max: {attrs['max_value']} {unit}".strip())
        if attrs.get('tolerance'): answer_parts.append(f"Tolerance: {attrs['tolerance']}")
        if attrs.get('applies_to'): answer_parts.append(f"Applies to: {attrs['applies_to']}")
        answer = " | ".join(answer_parts)
        category = "Power Supply & Electrical" if "voltage" in param.lower() or "current" in param.lower() else "General Knowledge"
        subcategory = "Technical Specifications"
        tags = ["specification", param.lower(), unit.lower(), "technical parameter"]

    elif cls == "Procedure":
        step = attrs.get('step_number', '?')
        action = attrs.get('action', 'perform step')
        question = f"What is step {step} in the HMS panel {attrs.get('component', 'installation')} procedure?"
        answer_parts = [f"Step {step}: {action}"]
        if attrs.get('expected_result'): answer_parts.append(f"Expected: {attrs['expected_result']}")
        if attrs.get('warning'): answer_parts.append(f"⚠️ Warning: {attrs['warning']}")
        answer = " | ".join(answer_parts)
        category = "Installation & Commissioning"
        subcategory = "Procedures"
        tags = ["procedure", "step", f"step-{step}", attrs.get('component', '').lower()]

    elif cls == "ComponentSpec":
        comp = attrs.get('component_name', 'component')
        question = f"What are the specifications for the {comp}?"
        answer_parts = [f"{comp}"]
        if attrs.get('model_number'): answer_parts.append(f"Model: {attrs['model_number']}")
        if attrs.get('function'): answer_parts.append(f"Function: {attrs['function']}")
        if attrs.get('input_spec'): answer_parts.append(f"Input: {attrs['input_spec']}")
        if attrs.get('output_spec'): answer_parts.append(f"Output: {attrs['output_spec']}")
        if attrs.get('communication_protocol'): answer_parts.append(f"Protocol: {attrs['communication_protocol']}")
        if attrs.get('compatible_with'): answer_parts.append(f"Compatible: {attrs['compatible_with']}")
        answer = " | ".join(answer_parts)
        category = "Advanced Diagnostics & Integration"
        subcategory = "Component Specifications"
        tags = ["component", comp.lower(), attrs.get('model_number', '').lower()]

    else:
        question = f"What does the following information from {source_name} describe?"
        answer = text[:400] if text else "See source document"
        category = "General Knowledge"
        subcategory = "Extracted Content"
        tags = [cls.lower(), "extracted"]

    # Build rich embedding content (mirrors seed-supabase.ts buildEmbeddingText)
    content = "\n".join([
        f"Source: {source_name}",
        f"Category: {category}",
        f"Subcategory: {subcategory}",
        f"Entity Type: LangExtract — {cls}",
        f"Keywords: {', '.join(t for t in tags if t)}",
        f"Question: {question}",
        f"Answer: {answer}",
        f"Source Text: {(text or '')[:300]}",
    ])

    return {
        "id": f"langextract_{source_name.replace(' ', '_').lower()[:20]}_{idx:04d}",
        "question": question,
        "answer": answer,
        "category": category,
        "subcategory": subcategory,
        "product": "HMS Panel",
        "tags": [t for t in tags if t and len(t) > 1],
        "content": content,
        "source": "langextract",
        "source_name": source_name,
        "entity_class": cls,
        "source_text": (text or "")[:500],
        "attributes": attrs,
    }


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="LangExtract pre-processor for HMS technical PDFs"
    )
    parser.add_argument("--file", required=True, help="Path to PDF file")
    parser.add_argument("--name", required=True, help="Source name for tracking")
    parser.add_argument("--passes", type=int, default=2, help="Extraction passes (default 2, use 3 for large PDFs)")
    parser.add_argument("--workers", type=int, default=3, help="Parallel workers (default 3)")
    parser.add_argument("--model", default="gemini-2.0-flash", help="Gemini model (default: gemini-2.0-flash)")
    parser.add_argument("--output-dir", default="data/langextract", help="Output directory for JSONL")
    args = parser.parse_args()

    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("NEXT_PUBLIC_GEMINI_API_KEY")
    if not gemini_key:
        print("❌ GEMINI_API_KEY not found in .env or .env.local")
        sys.exit(1)

    if not Path(args.file).exists():
        print(f"❌ File not found: {args.file}")
        sys.exit(1)

    source_name = args.name
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    safe_name = source_name.replace(" ", "_").replace("/", "-").lower()[:40]
    output_path = output_dir / f"{safe_name}_extracted.jsonl"

    print("\n" + "═" * 60)
    print("🔬 LangExtract HMS Pre-Processor")
    print("   Extraction: Google LangExtract + Gemini vision")
    print("   Output:     JSONL → feed into ingest-jsonl.ts")
    print("═" * 60)
    print(f"📄 File:       {args.file}")
    print(f"📝 Source:     {source_name}")
    print(f"🔄 Passes:     {args.passes} (multi-pass for higher recall)")
    print(f"⚡ Workers:    {args.workers} parallel chunks")
    print(f"🤖 Model:      {args.model}")
    print(f"📂 Output:     {output_path}\n")

    # Read PDF
    print("📖 Reading PDF...")
    with open(args.file, "rb") as f:
        pdf_bytes = f.read()
    print(f"   {len(pdf_bytes) / 1024:.0f} KB loaded")

    # Run LangExtract
    print(f"\n🔬 Running LangExtract ({args.passes} passes, {args.workers} workers)...")
    print("   This extracts: ErrorCodes, WiringSpecs, TechnicalParams, Procedures, ComponentSpecs\n")

    try:
        # LangExtract supports PDF bytes directly via text_or_documents
        result = lx.extract(
            text_or_documents=pdf_bytes,
            prompt_description=HMS_PROMPT,
            examples=HMS_EXAMPLES,
            model_id=args.model,
            api_key=gemini_key,
            extraction_passes=args.passes,
            max_workers=args.workers,
        )
    except Exception as e:
        print(f"❌ LangExtract failed: {e}")
        print("\n💡 Try: pip install --upgrade langextract google-generativeai")
        sys.exit(1)

    # Count by class
    class_counts: dict[str, int] = {}
    for entity in result.extractions:
        cls = entity.extraction_class
        class_counts[cls] = class_counts.get(cls, 0) + 1

    print(f"✅ LangExtract complete: {len(result.extractions)} entities found\n")
    print("   Breakdown by type:")
    for cls, count in sorted(class_counts.items(), key=lambda x: -x[1]):
        icon = {"ErrorCode": "⚠️", "WiringSpec": "🔌", "TechnicalParam": "📐",
                "Procedure": "📋", "ComponentSpec": "⚙️"}.get(cls, "📄")
        print(f"     {icon}  {cls.ljust(20)} {count}")

    # Convert to knowledge entries
    print(f"\n📝 Converting {len(result.extractions)} entities to HMS knowledge entries...")
    entries = []
    for i, entity in enumerate(result.extractions):
        try:
            entry = entity_to_knowledge_entry(entity, source_name, i)
            entries.append(entry)
        except Exception as e:
            print(f"   ⚠️  Skipping entity {i}: {e}")

    # Write JSONL
    with open(output_path, "w", encoding="utf-8") as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"\n{'═' * 60}")
    print(f"✅ Done! {len(entries)} knowledge entries written")
    print(f"   Output: {output_path}")
    print(f"\n📌 Next steps:")
    print(f"   1. Embed with OpenAI + seed to Supabase:")
    print(f"      npx tsx scripts/ingest-jsonl.ts --file=\"{output_path}\" --name=\"{source_name}\"")
    print(f"")
    print(f"   2. Or run BOTH pipelines for maximum coverage:")
    print(f"      python scripts/langextract-ingest.py --file=\"{args.file}\" --name=\"{source_name}\"")
    print(f"      npx tsx scripts/ingest-pdf.ts --file=\"{args.file}\" --name=\"{source_name}\"")
    print(f"")
    print(f"   3. Check results in admin dashboard → Analytics → Knowledge Base")
    print(f"      Source 'langextract' will show {len(entries)} entries")
    print(f"{'═' * 60}\n")

    # Save HTML visualization (LangExtract feature)
    viz_path = output_dir / f"{safe_name}_visualization.html"
    try:
        result.visualize(str(viz_path))
        print(f"🎨 Interactive visualization saved: {viz_path}")
        print(f"   Open in browser to review all extractions in context\n")
    except Exception:
        pass  # Visualization is optional

    return len(entries)


if __name__ == "__main__":
    main()