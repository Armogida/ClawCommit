---
name: gemini-clawcommit
description: Automate the full ClawCommit decision cycle (commit, reveal, verify) using Gemini.
---

# Gemini ClawCommit Skill

## Overview

This skill provides a tool to run the full ClawCommit decision cycle, including committing an AI decision, revealing it on-chain, and verifying its integrity. It leverages the existing `decision_cycle.sh` script to ensure deterministic and verifiable AI decision logging.

## Tools

### `run_decision_cycle`

Runs a complete ClawCommit decision cycle.

#### Parameters

- `repo_path`: Path to the ClawCommit repository.
- `contract_address`: The address of the deployed ClawCommit contract.
- `prompt`: The AI prompt that led to the decision.
- `output`: The AI's generated output/decision.
- `model_version`: The version of the AI model used.
- `network`: The blockchain network to use (e.g., `bscTestnet`, `bsc`).
- `json_out_path`: Path to output a JSON summary of the decision cycle.

## Usage

This skill simplifies the process of creating a tamper-evident audit trail for AI decisions by automating the commit, reveal, and verify steps.
