"use client";

import { useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";

type Language = "en" | "bn" | "hi";

const LANGUAGES: { value: Language; label: string; native: string; flag: string }[] = [
  { value: "en", label: "English", native: "English", flag: "🇬🇧" },
  { value: "bn", label: "Bengali", native: "বাংলা", flag: "🇧🇩" },
  { value: "hi", label: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
];

interface LanguageSelectorProps {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export default function LanguageSelector({ language, setLanguage }: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find((l) => l.value === language) ?? LANGUAGES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');

        .lang-selector * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }

        .lang-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px 6px 8px;
          border-radius: 10px;
          border: 1.5px solid rgba(202,138,4,0.25);
          background: linear-gradient(135deg, rgba(255,251,235,0.9) 0%, rgba(254,243,199,0.7) 100%);
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
          color: #57534e;
          font-size: 13px;
          font-weight: 500;
          user-select: none;
          position: relative;
          overflow: hidden;
        }

        .lang-trigger::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(202,138,4,0.08), transparent);
          opacity: 0;
          transition: opacity 0.2s;
          border-radius: inherit;
        }

        .lang-trigger:hover {
          border-color: rgba(202,138,4,0.55);
          box-shadow: 0 2px 8px rgba(202,138,4,0.15), inset 0 1px 0 rgba(255,255,255,0.9);
          transform: translateY(-1px);
          color: #44403c;
        }

        .lang-trigger:hover::before { opacity: 1; }

        .lang-trigger.open {
          border-color: rgba(202,138,4,0.6);
          box-shadow: 0 0 0 3px rgba(202,138,4,0.12), 0 2px 8px rgba(202,138,4,0.15);
          transform: translateY(-1px);
        }

        .globe-icon {
          color: #ca8a04;
          transition: transform 0.5s cubic-bezier(0.34,1.56,0.64,1);
        }

        .lang-trigger:hover .globe-icon,
        .lang-trigger.open .globe-icon {
          transform: rotate(20deg) scale(1.1);
        }

        .lang-flag {
          font-size: 14px;
          line-height: 1;
          filter: drop-shadow(0 1px 1px rgba(0,0,0,0.1));
          transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }

        .lang-trigger:hover .lang-flag { transform: scale(1.15); }

        .chevron {
          width: 10px;
          height: 10px;
          color: #a8a29e;
          transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), color 0.2s;
          flex-shrink: 0;
        }

        .lang-trigger:hover .chevron { color: #ca8a04; }
        .lang-trigger.open .chevron { transform: rotate(180deg); color: #ca8a04; }

        /* Dropdown */
        .lang-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          z-index: 50;
          min-width: 155px;
          background: rgba(255,253,245,0.97);
          backdrop-filter: blur(12px);
          border: 1.5px solid rgba(202,138,4,0.2);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9);
          overflow: hidden;
          transform-origin: top right;
          animation: dropIn 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }

        .lang-dropdown.closing {
          animation: dropOut 0.16s ease-in forwards;
        }

        @keyframes dropIn {
          from { opacity: 0; transform: scale(0.9) translateY(-6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        @keyframes dropOut {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to   { opacity: 0; transform: scale(0.92) translateY(-4px); }
        }

        .lang-option {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 9px 12px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          color: #57534e;
          font-size: 13px;
          font-weight: 500;
          position: relative;
        }

        .lang-option:not(:last-child)::after {
          content: '';
          position: absolute;
          bottom: 0; left: 12px; right: 12px;
          height: 1px;
          background: rgba(202,138,4,0.1);
        }

        .lang-option:hover {
          background: rgba(202,138,4,0.07);
          color: #44403c;
        }

        .lang-option.selected {
          background: linear-gradient(135deg, rgba(202,138,4,0.1), rgba(202,138,4,0.06));
          color: #92400e;
        }

        .lang-option .opt-flag {
          font-size: 16px;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.12));
          transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }

        .lang-option:hover .opt-flag { transform: scale(1.2) rotate(-5deg); }

        .lang-option .opt-names {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }

        .lang-option .opt-native {
          font-size: 11px;
          color: #a8a29e;
          font-weight: 400;
          transition: color 0.15s;
        }

        .lang-option.selected .opt-native { color: #b45309; }
        .lang-option:hover .opt-native { color: #78716c; }

        .check-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ca8a04;
          margin-left: auto;
          box-shadow: 0 0 4px rgba(202,138,4,0.5);
          animation: pulseCheck 1.5s ease-in-out infinite;
        }

        @keyframes pulseCheck {
          0%, 100% { box-shadow: 0 0 4px rgba(202,138,4,0.5); }
          50%       { box-shadow: 0 0 8px rgba(202,138,4,0.8); }
        }
      `}</style>

      <div className="lang-selector" style={{ position: "relative", display: "inline-block" }} ref={ref}>
        {/* Trigger button */}
        <button
          className={`lang-trigger ${open ? "open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <Globe size={13} className="globe-icon" />
          <span className="lang-flag">{current.flag}</span>
          <span style={{ letterSpacing: "0.01em" }}>{current.label}</span>
          <svg className="chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,4 6,8 10,4" />
          </svg>
        </button>

        {/* Dropdown */}
        {open && (
          <div className="lang-dropdown" role="listbox">
            {LANGUAGES.map((lang) => (
              <div
                key={lang.value}
                role="option"
                aria-selected={lang.value === language}
                className={`lang-option ${lang.value === language ? "selected" : ""}`}
                onClick={() => {
                  setLanguage(lang.value);
                  setOpen(false);
                }}
              >
                <span className="opt-flag">{lang.flag}</span>
                <span className="opt-names">
                  <span>{lang.label}</span>
                  <span className="opt-native">{lang.native}</span>
                </span>
                {lang.value === language && <span className="check-dot" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
