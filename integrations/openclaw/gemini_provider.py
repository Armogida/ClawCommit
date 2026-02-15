#!/usr/bin/env python3
"""
Python Gemini wrapper that attests decisions with ClawCommit before returning.

Usage example:
  python integrations/openclaw/gemini_provider.py \
    --repo /path/to/ClawCommit \
    --network bscTestnet \
    --contract 0x... \
    --api-key "$GEMINI_API_KEY" \
    --prompt "Audit this PR"

This script writes a standardized OpenClaw decision log and then calls
integrations/openclaw/convert-to-clawcommit.js with --run-decision-cycle.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def _safe_import_gemini() -> Any:
    try:
        import google.generativeai as genai  # type: ignore
    except Exception as error:  # pragma: no cover
        raise RuntimeError(
            "google-generativeai is required. Install with: pip install google-generativeai"
        ) from error
    return genai


def _nonce() -> str:
    return "0x" + secrets.token_hex(32)


@dataclass
class GeminiProviderConfig:
    repo: Path
    network: str
    contract: str
    api_key: str
    model: str = "gemini-1.5-pro"
    rpc_url: str = ""
    allow_mainnet_writes: bool = False
    json_out: str = ""


class GeminiProvider:
    def __init__(self, config: GeminiProviderConfig):
        self.config = config
        self._genai = _safe_import_gemini()
        self._genai.configure(api_key=config.api_key)

    def generate_and_commit(
        self,
        *,
        prompt: str,
        generation_config: Dict[str, Any] | None = None,
        safety_settings: List[Dict[str, Any]] | None = None,
        output_override: str | None = None,
    ) -> Dict[str, Any]:
        generation_config = generation_config or {
            "temperature": 0.2,
            "top_p": 0.95,
            "candidate_count": 1,
            "stop_sequences": [],
        }
        safety_settings = safety_settings or []

        model = self._genai.GenerativeModel(
            self.config.model,
            generation_config=generation_config,
            safety_settings=safety_settings,
        )

        result = model.generate_content(prompt)
        output = output_override or (result.text or "").strip()
        if not output:
            raise RuntimeError("Gemini returned empty output; refusing to commit")

        log_payload = {
            "provider": "gemini",
            "sessionId": f"py-gemini-{int(datetime.now(tz=timezone.utc).timestamp())}",
            "agentId": "openclaw-python-wrapper",
            "eventType": "PYTHON_GEMINI_DECISION",
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "prompt": prompt,
            "output": output,
            "modelVersion": self.config.model,
            "nonce": _nonce(),
            "generationConfig": {
                "temperature": generation_config.get("temperature", 0.2),
                "topP": generation_config.get("top_p", 0.95),
                "candidateCount": generation_config.get("candidate_count", 1),
                "stopSequences": generation_config.get("stop_sequences", []),
                "safetySettings": safety_settings,
            },
            "metadata": {
                "source": "integrations/openclaw/gemini_provider.py",
            },
        }

        with tempfile.TemporaryDirectory(prefix="clawcommit-gemini-") as tmp:
            tmp_path = Path(tmp)
            input_path = tmp_path / "gemini-run.json"
            out_path = tmp_path / "clawcommit-decision.json"
            input_path.write_text(json.dumps(log_payload, indent=2) + "\n", encoding="utf-8")

            cmd = [
                "node",
                str(self.config.repo / "integrations/openclaw/convert-to-clawcommit.js"),
                "--input",
                str(input_path),
                "--out",
                str(out_path),
                "--run-decision-cycle",
                "--repo",
                str(self.config.repo),
                "--network",
                self.config.network,
                "--contract",
                self.config.contract,
                "--allow-mainnet-writes",
                "true" if self.config.allow_mainnet_writes else "false",
                "--json-out",
                self.config.json_out or str(self.config.repo / "deployment-proof/python-gemini-cycle.json"),
            ]
            if self.config.rpc_url:
                cmd.extend(["--rpc", self.config.rpc_url])

            subprocess.run(cmd, check=True)

        return {
            "output": output,
            "modelVersion": self.config.model,
            "decisionLog": log_payload,
        }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Gemini -> ClawCommit Python wrapper")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--network", default="bscTestnet")
    parser.add_argument("--contract", required=True)
    parser.add_argument("--api-key", default=os.environ.get("GEMINI_API_KEY", ""))
    parser.add_argument("--model", default="gemini-1.5-pro")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--rpc-url", default="")
    parser.add_argument("--json-out", default="")
    parser.add_argument("--allow-mainnet-writes", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if not args.api_key:
        raise RuntimeError("Missing Gemini API key. Provide --api-key or GEMINI_API_KEY")

    provider = GeminiProvider(
        GeminiProviderConfig(
            repo=Path(args.repo).resolve(),
            network=args.network,
            contract=args.contract,
            api_key=args.api_key,
            model=args.model,
            rpc_url=args.rpc_url,
            json_out=args.json_out,
            allow_mainnet_writes=args.allow_mainnet_writes,
        )
    )

    result = provider.generate_and_commit(prompt=args.prompt)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
