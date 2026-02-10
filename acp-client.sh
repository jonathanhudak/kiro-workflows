#!/bin/bash
# acp-client.sh — Lightweight ACP client for ralph.sh
# Communicates with kiro-cli via JSON-RPC 2.0 over stdin/stdout
#
# Usage:
#   source acp-client.sh
#   acp_start
#   session_id=$(acp_new_session "/path/to/project")
#   acp_prompt "$session_id" "Implement feature X"
#   acp_stop

set -euo pipefail

ACP_PID=""
ACP_IN=""
ACP_OUT=""
ACP_REQ_ID=0

# Start the ACP agent process
acp_start() {
    local kiro_path="${KIRO_CLI_PATH:-$(which kiro-cli 2>/dev/null || echo "$HOME/.local/bin/kiro-cli")}"
    
    # Create named pipes for communication
    ACP_IN=$(mktemp -u /tmp/acp-in.XXXXXX)
    ACP_OUT=$(mktemp -u /tmp/acp-out.XXXXXX)
    mkfifo "$ACP_IN" "$ACP_OUT"
    
    # Start kiro-cli acp in background
    "$kiro_path" acp < "$ACP_IN" > "$ACP_OUT" 2>/tmp/kiro-acp-stderr.log &
    ACP_PID=$!
    
    # Open file descriptors
    exec 3>"$ACP_IN"  # Write to kiro
    exec 4<"$ACP_OUT" # Read from kiro
    
    # Initialize connection
    _acp_send '{
        "jsonrpc": "2.0",
        "id": 0,
        "method": "initialize",
        "params": {
            "protocolVersion": 1,
            "clientCapabilities": {
                "fs": { "readTextFile": true, "writeTextFile": true },
                "terminal": true
            },
            "clientInfo": {
                "name": "ralph-loop",
                "version": "1.0.0"
            }
        }
    }'
    
    local response=$(_acp_read)
    if echo "$response" | jq -e '.result.agentInfo' > /dev/null 2>&1; then
        local version=$(echo "$response" | jq -r '.result.agentInfo.version')
        echo "[acp] Connected to kiro-cli $version" >&2
    else
        echo "[acp] Warning: unexpected initialize response" >&2
    fi
}

# Stop the ACP agent
acp_stop() {
    [ -n "$ACP_PID" ] && kill "$ACP_PID" 2>/dev/null || true
    exec 3>&- 2>/dev/null || true
    exec 4>&- 2>/dev/null || true
    [ -n "$ACP_IN" ] && rm -f "$ACP_IN"
    [ -n "$ACP_OUT" ] && rm -f "$ACP_OUT"
    ACP_PID=""
}

# Create a new session
acp_new_session() {
    local cwd="${1:-.}"
    local agent="${2:-}"
    
    ACP_REQ_ID=$((ACP_REQ_ID + 1))
    
    _acp_send "{
        \"jsonrpc\": \"2.0\",
        \"id\": $ACP_REQ_ID,
        \"method\": \"session/new\",
        \"params\": {
            \"cwd\": \"$cwd\",
            \"mcpServers\": []
        }
    }"
    
    local response=$(_acp_read)
    local session_id=$(echo "$response" | jq -r '.result.sessionId // empty')
    
    # Switch agent if specified
    if [ -n "$agent" ] && [ -n "$session_id" ]; then
        acp_set_agent "$session_id" "$agent"
    fi
    
    echo "$session_id"
}

# Send a prompt and collect the full response
acp_prompt() {
    local session_id="$1"
    local text="$2"
    
    ACP_REQ_ID=$((ACP_REQ_ID + 1))
    
    # Escape the text for JSON
    local escaped_text=$(echo "$text" | jq -Rs '.')
    
    _acp_send "{
        \"jsonrpc\": \"2.0\",
        \"id\": $ACP_REQ_ID,
        \"method\": \"session/prompt\",
        \"params\": {
            \"sessionId\": \"$session_id\",
            \"content\": [
                {
                    \"type\": \"text\",
                    \"text\": $escaped_text
                }
            ]
        }
    }"
    
    # Collect streaming response until TurnEnd
    local full_response=""
    while true; do
        local chunk=$(_acp_read)
        local method=$(echo "$chunk" | jq -r '.method // empty')
        
        case "$method" in
            "session/notification")
                local update_type=$(echo "$chunk" | jq -r '.params.kind // .params.type // empty')
                case "$update_type" in
                    "AgentMessageChunk")
                        local text_chunk=$(echo "$chunk" | jq -r '.params.content // empty')
                        full_response+="$text_chunk"
                        ;;
                    "ToolCall")
                        local tool=$(echo "$chunk" | jq -r '.params.name // empty')
                        echo "[acp] Tool: $tool" >&2
                        ;;
                    "TurnEnd")
                        break
                        ;;
                esac
                ;;
            "")
                # Regular response (non-notification)
                if echo "$chunk" | jq -e '.result' > /dev/null 2>&1; then
                    break
                fi
                ;;
        esac
    done
    
    echo "$full_response"
}

# Switch agent mode
acp_set_agent() {
    local session_id="$1"
    local agent="$2"
    
    ACP_REQ_ID=$((ACP_REQ_ID + 1))
    
    _acp_send "{
        \"jsonrpc\": \"2.0\",
        \"id\": $ACP_REQ_ID,
        \"method\": \"_kiro.dev/commands/execute\",
        \"params\": {
            \"sessionId\": \"$session_id\",
            \"command\": \"/agent $agent\"
        }
    }"
    
    _acp_read > /dev/null  # consume response
}

# Cancel current operation
acp_cancel() {
    local session_id="$1"
    
    ACP_REQ_ID=$((ACP_REQ_ID + 1))
    
    _acp_send "{
        \"jsonrpc\": \"2.0\",
        \"id\": $ACP_REQ_ID,
        \"method\": \"session/cancel\",
        \"params\": {
            \"sessionId\": \"$session_id\"
        }
    }"
}

# Internal: send JSON-RPC message
_acp_send() {
    echo "$1" >&3
}

# Internal: read one JSON-RPC message
_acp_read() {
    local line
    read -r line <&4
    echo "$line"
}

# Cleanup on exit
trap acp_stop EXIT
