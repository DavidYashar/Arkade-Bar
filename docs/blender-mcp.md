# Blender MCP, as installed here

Official project: <https://projects.blender.org/lab/blender_mcp>. The page
<https://www.blender.org/lab/mcp-server/> is behind Cloudflare and refuses requests from this
machine, so the instructions were read from the Wayback snapshot of 2026-11-18.

## Parts

```
MCP client  ⇐ MCP over stdio ⇒  blender-mcp  ⇐ TCP localhost:9876 ⇒  add-on inside Blender
```

- **Add-on** `mcp` 1.0.3, installed in Blender 5.2.3. It is the socket bridge and the
  executor: every MCP tool sends Python that runs inside Blender.
- **MCP server** `blender-mcp` 1.0.2 (Python), installed in a venv. It holds the tools and
  the Blender API reference, and relays to the add-on.

## Installed here

```powershell
# add-on, official release asset
Invoke-WebRequest https://projects.blender.org/lab/blender_mcp/releases/download/v1.0.3/mcp-1.0.3.zip -OutFile mcp-1.0.3.zip
blender --command extension install-file -r user_default -e mcp-1.0.3.zip

# server, in a venv (build isolation hangs on this machine)
python -m venv .venv
.venv\Scripts\python -m pip install setuptools
.venv\Scripts\python -m pip install --no-build-isolation -e mcp
```

## Running

```powershell
# bridge from the command line, no window
blender -b --online-mode --command blender_mcp
```

Or interactively: Preferences, Add-ons, MCP, Start MCP Bridge Server.

`--online-mode` is required: Blender refuses the socket otherwise with "Online access must be
enabled in the system preferences". The bridge listens on `localhost:9876`.

The client side, as tested, is any MCP client over stdio, or `python -m blmcp`.

## Verified

26 tools listed; `execute_blender_code` returned `{"blender": "5.2.3 LTS", "objects":
["Camera", "Cube", "Light"]}` from a live Blender.

Tools: `execute_blender_code`, blend file summaries (data-blocks, missing files, linked
libraries, path info, usage guess), object summaries, Python API doc search, area and window
screenshots, workspace tab jumping.

## Warning, from the official page

The server runs LLM-generated code in Blender with no guards protecting your data. Blender
recommends a virtual machine, or a machine without access to sensitive information. This
machine holds the Bankroll development settings, so the bridge should only be started for a
specific task and stopped after it.
