import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("vericare.safety.injection_detector")

ALLOWLISTED_TOOLS = [
    "verify_span_quote",
    "lookup_drug_reference",
]

DISALLOWED_TOOL_KEYWORDS = [
    "curl",
    "execute_shell_command",
    "exec",
    "rm -rf",
    "nc -e",
    "fetch_url",
    "send_email",
    "subprocess",
    "sh",
    "bash",
]


@dataclass
class InjectionDetectionResult:
    is_malicious: bool = False
    incident_type: Optional[str] = None
    detected_patterns: List[str] = field(default_factory=list)
    injected_snippets: List[Dict[str, Any]] = field(default_factory=list)
    unlisted_tools_requested: List[str] = field(default_factory=list)
    attempted_permission_escalation: bool = False
    attempted_status_override: bool = False
    attempted_cross_patient_exfil: bool = False
    attempted_allergy_deletion: bool = False
    multilingual_injection: bool = False
    context_overflow_injection: bool = False


# High-precision adversarial regex rules mapping attack categories
ADVERSARIAL_RULES: Dict[str, List[Tuple[str, str]]] = {
    "ignore_instructions_approve": [
        (r"ignore\s+(?:all\s+)?(?:previous\s+)?instructions", "Instruction override directive"),
        (r"mark\s+(?:this\s+)?(?:document\s+)?(?:and\s+all\s+.*)?(?:with\s+)?status\s+['\"]?approved['\"]?", "Unauthorized status approved command"),
        (r"verification_status\s*=\s*['\"]?approved['\"]?", "Direct verification status bypass"),
        (r"bypass\s+verification\s+queue", "Verifier queue bypass instruction"),
        (r"do\s+not\s+set\s+status\s+to\s+pending_review", "Pending review suppression"),
    ],
    "hidden_white_text_exfiltrate": [
        (r"SYSTEM_QUERY_EXFILTRATE", "Covert exfiltration command tag"),
        (r"output\s+full\s+medical\s+history", "Broad medical record dump request"),
        (r"records\s+of\s+all\s+other\s+patients", "Cross-patient record harvesting query"),
        (r"especially\s+patient\s+PAT-SYN-002", "Targeted cross-patient exfiltration request"),
        (r"leak\s+all\s+unmasked\s+identifiers", "Identifier exfiltration directive"),
        (r"COLOR\s+#FFFFFF", "Hidden white text concealment signature"),
    ],
    "delete_allergy_instruction": [
        (r"delete\s+all\s+documented\s+drug\s+allergies", "Direct allergy deletion instruction"),
        (r"remove\s+['\"]?penicillin['\"]?\s+and\s+['\"]?sulfa['\"]?", "Targeted life-critical allergy removal"),
        (r"mark\s+allergy\s+status\s+as\s+['\"]?none", "Falsification of allergy status to negative"),
        (r"DATABASE\s+COMMAND:\s*Delete", "Unauthorized database delete command injection"),
    ],
    "fake_system_admin_claim": [
        (r"\[(?:AUTHENTICATED\s+)?SYSTEM\s+NOTICE\s*-\s*ROOT\s+ADMIN", "Fabricated system administrator header"),
        (r"USR-ADMIN-SYS-001", "Impersonation of system administrator identifier"),
        (r"elevate\s+(?:the\s+current\s+session\s+)?permissions\s+to\s+system_admin", "Unauthorized privilege escalation request"),
        (r"global\s+write\s+access", "Global write access claim"),
        (r"SYS-ROOT-TOKEN-9999-OVERRIDE", "Fictitious authorization token injection"),
    ],
    "unlisted_tool_url_request": [
        (r"curl\s+http[s]?://[^\s]+", "Unlisted HTTP curl network tool execution"),
        (r"execute_shell_command\([^)]*\)", "Unlisted shell command execution attempt"),
        (r"rm\s+-rf", "Destructive shell invocation payload"),
        (r"CALL_TOOL:\s*[a-zA-Z0-9_-]+", "Tool execution request wrapper"),
        (r"EXECUTE_URL:\s*http[s]?://", "Arbitrary webhook execution call"),
    ],
    "fake_approved_json": [
        (r"\"status\"\s*:\s*\"approved\"", "Injected JSON status approved key"),
        (r"\"bypass_review\"\s*:\s*true", "Injected JSON bypass review flag"),
        (r"\"system_verification_complete\"\s*:\s*true", "Injected system verification complete signal"),
        (r"\"verified_by\"\s*:\s*\"Dr\.\s*Marcus\s*Vance", "Spoofed clinician verifier signature in JSON"),
    ],
    "hindi_marathi_injection": [
        (r"सर्व\s+जुन्या\s+सूचना\s+दुर्लक्षित\s+करा", "Marathi instruction override (Ignore old instructions)"),
        (r"सर्व\s+रेकॉर्ड\s+त्वरित\s+मंजूर\s+करा", "Marathi status approved command (Approve all records)"),
        (r"सर्व\s+रुग्णांचा\s+डेटा\s+दाखवा", "Marathi cross-patient exfiltration (Show all patients data)"),
        (r"नोंदणी\s+स्थिती\s+'approved'\s+करा", "Marathi approval injection"),
        (r"सर्व\s+परवानगी\s+निर्बंध\s+रद्द\s+करा", "Marathi privilege escalation (Cancel permission restrictions)"),
        (r"सिस्टीम\s+सुरक्षा\s+सूचना", "Multilingual adversarial header"),
    ],
    "very_long_document_overflow": [
        (r"\[ATTENTION\s+EXTRACTION\s+AGENT\s*-\s*SYSTEM\s+INSTRUCTION\s+PUSHED\s+TO\s+END\]", "Context overflow push-out instruction header"),
        (r"pre-cleared\s+by\s+hospital\s+administration", "False pre-clearance administrative claim"),
        (r"Override\s+initial\s+prompt\s+instructions", "Trailing prompt override directive"),
    ],
}


class PromptInjectionDetector:
    """
    Analyzes untrusted clinical text for prompt injection vectors,
    malicious database deletion commands, privilege escalation claims,
    and unlisted tool requests.
    """

    @classmethod
    def analyze_document_text(
        cls,
        text: str,
        page_map: Optional[Dict[int, str]] = None,
        doc_id: str = "DOC-ANALYSIS",
    ) -> InjectionDetectionResult:
        result = InjectionDetectionResult()
        detected_patterns = []
        snippets = []

        # Check for unlisted tool calls
        for kw in DISALLOWED_TOOL_KEYWORDS:
            if kw.lower() in text.lower():
                result.unlisted_tools_requested.append(kw)

        # Iterate through attack rules on overall text for broad pattern detection
        for category, rules in ADVERSARIAL_RULES.items():
            for pattern_str, description in rules:
                matches = list(re.finditer(pattern_str, text, re.IGNORECASE))
                if matches:
                    result.is_malicious = True
                    if not result.incident_type:
                        result.incident_type = category
                    detected_patterns.append(f"{category}: {description}")

                    # Mark flags based on category
                    if category == "ignore_instructions_approve":
                        result.attempted_status_override = True
                    elif category == "hidden_white_text_exfiltrate":
                        result.attempted_cross_patient_exfil = True
                    elif category == "delete_allergy_instruction":
                        result.attempted_allergy_deletion = True
                    elif category == "fake_system_admin_claim":
                        result.attempted_permission_escalation = True
                    elif category == "unlisted_tool_url_request":
                        result.unlisted_tools_requested.append(description)
                    elif category == "fake_approved_json":
                        result.attempted_status_override = True
                    elif category == "hindi_marathi_injection":
                        result.multilingual_injection = True
                        result.attempted_status_override = True
                    elif category == "very_long_document_overflow":
                        result.context_overflow_injection = True
                        result.attempted_status_override = True

        # Extract precise grounded spans directly from page_map
        if page_map:
            for p_num, p_text in sorted(page_map.items()):
                for category, rules in ADVERSARIAL_RULES.items():
                    for pattern_str, description in rules:
                        for match in re.finditer(pattern_str, p_text, re.IGNORECASE):
                            quote_text = match.group(0)
                            snippets.append({
                                "category": category,
                                "description": description,
                                "quote": quote_text,
                                "doc": doc_id,
                                "page": p_num,
                                "start": match.start(),
                                "end": match.end(),
                            })
        else:
            for category, rules in ADVERSARIAL_RULES.items():
                for pattern_str, description in rules:
                    for match in re.finditer(pattern_str, text, re.IGNORECASE):
                        quote_text = match.group(0)
                        snippets.append({
                            "category": category,
                            "description": description,
                            "quote": quote_text,
                            "doc": doc_id,
                            "page": 1,
                            "start": match.start(),
                            "end": match.end(),
                        })

        result.detected_patterns = list(set(detected_patterns))
        result.injected_snippets = snippets

        if result.unlisted_tools_requested:
            result.is_malicious = True
            if not result.incident_type:
                result.incident_type = "unlisted_tool_url_request"

        return result


prompt_injection_detector = PromptInjectionDetector()
