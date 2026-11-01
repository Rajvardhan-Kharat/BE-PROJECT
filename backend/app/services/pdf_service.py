import logging
from typing import Dict, List, Tuple
import pymupdf
from pydantic import BaseModel

logger = logging.getLogger("vericare.pdf")


class PDFPageText(BaseModel):
    page: int  # 1-indexed
    text: str
    char_count: int
    start_offset: int  # Global offset across full doc
    end_offset: int


class PDFExtractionResult(BaseModel):
    total_pages: int
    total_chars: int
    pages: List[PDFPageText]
    full_text: str
    page_map: Dict[int, str]  # 1-indexed page number -> page text


class PDFService:
    @staticmethod
    def extract_text_with_offsets(pdf_bytes: bytes) -> PDFExtractionResult:
        """
        Parses text PDF and extracts per-page text preserving page numbers and character offsets.
        """
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        pages: List[PDFPageText] = []
        page_map: Dict[int, str] = {}
        full_text_parts: List[str] = []
        current_global_offset = 0

        for page_idx in range(len(doc)):
            page_num = page_idx + 1  # 1-indexed
            page = doc[page_idx]
            page_text = page.get_text()

            char_len = len(page_text)
            start_off = current_global_offset
            end_off = start_off + char_len

            page_info = PDFPageText(
                page=page_num,
                text=page_text,
                char_count=char_len,
                start_offset=start_off,
                end_offset=end_off,
            )
            pages.append(page_info)
            page_map[page_num] = page_text
            full_text_parts.append(page_text)
            current_global_offset = end_off

        full_text = "".join(full_text_parts)
        doc.close()

        return PDFExtractionResult(
            total_pages=len(pages),
            total_chars=len(full_text),
            pages=pages,
            full_text=full_text,
            page_map=page_map,
        )

    @staticmethod
    def verify_quote_at_offset(
        page_num: int,
        start_char: int,
        end_char: int,
        quote: str,
        page_map: Dict[int, str],
    ) -> Tuple[bool, str]:
        """
        MANDATORY VERIFICATION:
        Verifies that quote is exactly present at [start_char:end_char] on page_num.
        Returns: (is_valid: bool, reason: str)
        """
        if page_num not in page_map:
            return False, f"Page {page_num} not found in document"

        page_text = page_map[page_num]
        text_len = len(page_text)

        if start_char < 0 or end_char > text_len or start_char >= end_char:
            return (
                False,
                f"Offsets [{start_char}:{end_char}] out of bounds for page {page_num} (length {text_len})",
            )

        actual_slice = page_text[start_char:end_char]

        # Exact match check
        if actual_slice == quote:
            return True, "Exact match verified"

        # Check if difference is only leading/trailing whitespace
        if actual_slice.strip() == quote.strip():
            return True, "Whitespace-normalized match verified"

        return (
            False,
            f"Offset quote mismatch on page {page_num}: expected '{quote}', found '{actual_slice}'",
        )


pdf_service = PDFService()
