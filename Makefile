VSCODE_ARTIFACT_URL="https://github.com/progrium/vscode-web/releases/download/v1/vscode-web-1.92.1-patched.zip"

vscode-web.zip:
	curl -qLo $@ $(VSCODE_ARTIFACT_URL)