// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ClawCommit
 * @notice Deterministic AI Decision Commit-Reveal Protocol
 * @dev Enables tamper-evident, auditable decision logs via commit-reveal with replay verification
 */
contract ClawCommit {
    struct Commitment {
        bytes32 hash;
        uint256 timestamp;
        address committer;
        bool revealed;
        string decision;
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
        string decision
    );

    /**
     * @notice Commit a hashed decision onchain
     * @param _hash The keccak256 hash of the decision and nonce
     * @return commitId The ID of the new commitment
     */
    function commit(bytes32 _hash) external returns (uint256 commitId) {
        commitId = commitCount;
        commitments[commitId] = Commitment({
            hash: _hash,
            timestamp: block.timestamp,
            committer: msg.sender,
            revealed: false,
            decision: "",
            nonce: ""
        });
        commitCount++;
        emit CommitCreated(commitId, msg.sender, _hash, block.timestamp);
    }

    /**
     * @notice Reveal a previously committed decision
     * @param _commitId The ID of the commitment to reveal
     * @param _decision The original decision string
     * @param _nonce The nonce used during commitment
     */
    function reveal(
        uint256 _commitId,
        string calldata _decision,
        string calldata _nonce
    ) external {
        Commitment storage c = commitments[_commitId];
        require(c.committer == msg.sender, "Only committer can reveal");
        require(!c.revealed, "Already revealed");
        require(
            c.hash == keccak256(abi.encodePacked(_decision, _nonce)),
            "Hash mismatch"
        );
        c.revealed = true;
        c.decision = _decision;
        c.nonce = _nonce;
        emit CommitRevealed(_commitId, msg.sender, _decision);
    }

    /**
     * @notice Get full commitment data
     * @param _commitId The ID of the commitment
     * @return The Commitment struct
     */
    function getCommitment(
        uint256 _commitId
    ) external view returns (Commitment memory) {
        return commitments[_commitId];
    }

    /**
     * @notice Verify a revealed commitment by replaying the hash
     * @param _commitId The ID of the commitment to verify
     * @return True if the stored hash matches the recomputed hash
     */
    function verify(uint256 _commitId) external view returns (bool) {
        Commitment memory c = commitments[_commitId];
        require(c.revealed, "Not yet revealed");
        return c.hash == keccak256(abi.encodePacked(c.decision, c.nonce));
    }

    /**
     * @notice Compute the hash for a given decision and nonce (utility)
     * @param _decision The decision string
     * @param _nonce The nonce string
     * @return The keccak256 hash
     */
    function computeHash(
        string calldata _decision,
        string calldata _nonce
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(_decision, _nonce));
    }
}
