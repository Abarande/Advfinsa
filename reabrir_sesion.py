# save_state.py
from playwright.sync_api import sync_playwright

SRI_PAGE = (
"https://calculadoras.trabajo.gob.ec/dependencia"
)

def main():
    with sync_playwright() as p:
        # 1) launch a persistent Firefox profile:
        ctx = p.firefox.launch_persistent_context(
            user_data_dir="ff_profile",
            headless=False,
            viewport={"width":1280, "height":800},
        )
        page = ctx.new_page()
        page.goto(SRI_PAGE, timeout=0)

        print("""
▶️  Firefox is up.  Please:
    1) fill in your RUC / cédula
    2) solve the ReCAPTCHA
    3) click “Consultar”  ← you should see a green check and/or results

When you see that it really _worked_, come back here and press ENTER.
""")
        input()  # <-- wait for you to hit Enter

        # 2) now that the widget is passed, dump the full storage state:
        ctx.storage_state(path="state.json")
        print("✅  state.json written.  You can now run headless without captcha.")
        ctx.close()

if __name__ == "__main__":
    main()
