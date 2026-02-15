// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ClawCommit
 * @notice Deterministic AI decision commit-reveal protocol with offchain replay verification.
 */
contract ClawCommit {
    error OnlyCommitter();
    error AlreadyRevealed();
    error HashMismatch();
    error NotRevealed();

    struct Commitment {
        bytes32 hash;
        uint256 timestamp;
        address committer;
        bool revealed;
        string prompt;
        string output;
        string modelVersion;
        string nonce;
    }

    uint256 public commitCount;
    mapping(uint256 => Commitment) public commitments;

    event CommitCreated(
        uint256 indexed commitId,
        address indexed committer,
        bytes32 hash,
        uint256 timestamp
    );

    event CommitRevealed(
        uint256 indexed commitId,
        address indexed committer,
        string prompt,
        string output,
        string modelVersion
    );

    function commitDecision(bytes32 _hash) external returns (uint256 commitId) {
        commitId = commitCount;
        commitments[commitId] = Commitment({
            hash: _hash,
            timestamp: block.timestamp,
            committer: msg.sender,
            revealed: false,
            prompt: "",
            output: "",
            modelVersion: "",
            nonce: ""
        });
        commitCount++;
        emit CommitCreated(commitId, msg.sender, _hash, block.timestamp);
    }

    function revealDecision(
        uint256 _commitId,
        string calldata _prompt,
        string calldata _output,
        string calldata _modelVersion,
        string calldata _nonce
    ) external {
        Commitment storage c = commitments[_commitId];

        if (c.committer != msg.sender) revert OnlyCommitter();
        if (c.revealed) revert AlreadyRevealed();

        bytes32 expectedHash = keccak256(
            abi.encode(_prompt, _output, _modelVersion, _nonce)
        );
        if (c.hash != expectedHash) revert HashMismatch();

        c.revealed = true;
        c.prompt = _prompt;
        c.output = _output;
        c.modelVersion = _modelVersion;
        c.nonce = _nonce;
        emit CommitRevealed(_commitId, msg.sender, _prompt, _output, _modelVersion);
    }

    function getCommitment(
        uint256 _commitId
    ) external view returns (Commitment memory) {
        return commitments[_commitId];
    }

    function verifyReplay(uint256 _commitId) external view returns (bool) {
        Commitment memory c = commitments[_commitId];
        if (!c.revealed) revert NotRevealed();
        return c.hash == keccak256(abi.encode(c.prompt, c.output, c.modelVersion, c.nonce));
    }

    function computeDecisionHash(
        string calldata _prompt,
        string calldata _output,
        string calldata _modelVersion,
        string calldata _nonce
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(_prompt, _output, _modelVersion, _nonce));
    }
}
