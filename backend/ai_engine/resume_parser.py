import pdfplumber


def extract_text_from_pdf(file_obj_or_path):
    text = ""

    try:
        if hasattr(file_obj_or_path, "open"):
            # Django FieldFile or similar file-like object
            with file_obj_or_path.open("rb") as f:
                with pdfplumber.open(f) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
        else:
            with pdfplumber.open(file_obj_or_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"

        return text.strip()

    except Exception as e:
        print("Resume parsing error:", e)
        return ""