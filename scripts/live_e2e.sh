#!/usr/bin/env bash
# scripts/live_e2e.sh — Control the live WSL runner server (start | stop | status).
# Usage: bash scripts/live_e2e.sh start [PORT]
#        bash scripts/live_e2e.sh stop [PORT]
#        bash scripts/live_e2e.sh status [PORT]

export MSYS_NO_PATHCONV=1
set -e

CMD="${1:-status}"
PORT="${2:-8765}"

WIN_M=$(cygpath -m "$PWD")
WSL_REPO_PATH=$(wsl -d Ubuntu --exec wslpath -a "$WIN_M" | tr -d '\r')

case "$CMD" in
  start)
    echo "==> Starting live server in WSL on port $PORT..."
    wsl -d Ubuntu --exec bash -c "
      if [ -f /tmp/phase-ordering-live.pid ]; then
        PID=\$(cat /tmp/phase-ordering-live.pid 2>/dev/null || true)
        if [ -n \"\$PID\" ] && kill -0 \"\$PID\" 2>/dev/null; then
          kill -INT \"\$PID\" 2>/dev/null || true
          sleep 2
        fi
      fi
    "

    # Start using native double-fork daemonization
    wsl -d Ubuntu --exec bash -c "
      cd '$WSL_REPO_PATH'
      source ~/venvs/rlphase/bin/activate
      python web/server.py --port $PORT --daemon --pidfile /tmp/phase-ordering-live.pid --logfile /tmp/phase-ordering-live.log
    "

    echo "==> Waiting for server health check on http://localhost:${PORT}/api/health (up to 90s)..."
    READY=0
    for i in $(seq 1 90); do
      if curl -s "http://localhost:${PORT}/api/health" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
        READY=1
        break
      fi
      sleep 1
    done

    if [ "$READY" -eq 1 ]; then
      echo "Live server is ready on http://localhost:${PORT}/"
      exit 0
    else
      echo "ERROR: Server failed to start within 90s. Log tail:" >&2
      wsl -d Ubuntu --exec bash -c "tail -n 30 /tmp/phase-ordering-live.log" >&2 || true
      exit 1
    fi
    ;;

  stop)
    echo "==> Stopping live server in WSL..."
    wsl -d Ubuntu --exec bash -c "
      if [ -f /tmp/phase-ordering-live.pid ]; then
        PID=\$(cat /tmp/phase-ordering-live.pid 2>/dev/null || true)
        if [ -n \"\$PID\" ] && kill -0 \"\$PID\" 2>/dev/null; then
          kill -INT \"\$PID\" 2>/dev/null || true
          for i in \$(seq 1 30); do
            if ! kill -0 \"\$PID\" 2>/dev/null; then
              break
            fi
            sleep 1
          done
          kill -9 \"\$PID\" 2>/dev/null || true
        fi
        rm -f /tmp/phase-ordering-live.pid
      fi
    "

    # Verify no leftover CompilerGym services
    echo "==> Checking for leftover compiler_gym-llvm-service processes..."
    LEFTOVER=$(wsl -d Ubuntu --exec bash -c "pgrep -fc '[c]ompiler_gym-llvm-service'" || true)
    LEFTOVER=$(echo "$LEFTOVER" | tr -d '\r')
    if [ "$LEFTOVER" -ne 0 ]; then
      echo "ERROR: Found $LEFTOVER leftover compiler_gym-llvm-service process(es) in WSL!" >&2
      wsl -d Ubuntu --exec bash -c "pgrep -fl '[c]ompiler_gym-llvm-service'" >&2 || true
      exit 1
    fi
    echo "Stop clean. No compiler_gym-llvm-service processes running."
    exit 0
    ;;

  status)
    echo "==> Checking status on http://localhost:${PORT}/api/health..."
    curl -s "http://localhost:${PORT}/api/health" || echo "Server not reachable"
    echo ""
    ;;

  *)
    echo "Usage: $0 {start|stop|status} [port]" >&2
    exit 1
    ;;
esac
