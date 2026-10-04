// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EvidenceRegistry
/// @notice Append-only evidence and custody registry for the border-surveillance backend.
/// @dev The writer is a dedicated Django signer. There are deliberately no edit or delete methods.
contract EvidenceRegistry {
    address public immutable writer;
    mapping(bytes32 => bool) public registeredIncidents;
    mapping(bytes32 => bytes32) public incidentEvidenceHashes;
    mapping(bytes32 => bool) public registeredCustodyEvents;

    event IncidentRegistered(
        bytes32 indexed incidentReferenceHash,
        bytes32 indexed evidenceHash,
        uint64 capturedAt
    );

    event HighSeverityIncidentRegistered(
        bytes32 indexed incidentReferenceHash,
        bytes32 indexed evidenceHash,
        bytes32 modelVersionHash,
        bytes32 modelArtifactHash,
        uint256 confidenceBps,
        uint256 decisionThresholdBps,
        uint64 capturedAt
    );

    event CustodyEventAppended(
        bytes32 indexed custodyEventId,
        bytes32 indexed incidentReferenceHash,
        bytes32 indexed evidenceHash,
        string action,
        string actorRole,
        uint64 occurredAt
    );

    error NotWriter();
    error IncidentNotRegistered();
    error EvidenceHashMismatch();
    error InvalidWriter();

    constructor(address initialWriter) {
        if (initialWriter == address(0)) revert InvalidWriter();
        writer = initialWriter;
    }

    modifier onlyWriter() {
        if (msg.sender != writer) revert NotWriter();
        _;
    }

    function registerIncident(
        bytes32 incidentReferenceHash,
        bytes32 evidenceHash,
        uint64 capturedAt
    ) external onlyWriter {
        if (_register(incidentReferenceHash, evidenceHash)) {
            emit IncidentRegistered(incidentReferenceHash, evidenceHash, capturedAt);
        }
    }

    function registerHighSeverityIncident(
        bytes32 incidentReferenceHash,
        bytes32 evidenceHash,
        bytes32 modelVersionHash,
        bytes32 modelArtifactHash,
        uint256 confidenceBps,
        uint256 decisionThresholdBps,
        uint64 capturedAt
    ) external onlyWriter {
        if (_register(incidentReferenceHash, evidenceHash)) {
            emit HighSeverityIncidentRegistered(
                incidentReferenceHash,
                evidenceHash,
                modelVersionHash,
                modelArtifactHash,
                confidenceBps,
                decisionThresholdBps,
                capturedAt
            );
        }
    }

    function appendCustodyEvent(
        bytes32 custodyEventId,
        bytes32 incidentReferenceHash,
        bytes32 evidenceHash,
        string calldata action,
        string calldata actorRole,
        uint64 occurredAt
    ) external onlyWriter {
        if (!registeredIncidents[incidentReferenceHash]) revert IncidentNotRegistered();
        if (registeredCustodyEvents[custodyEventId]) return;
        registeredCustodyEvents[custodyEventId] = true;
        emit CustodyEventAppended(
            custodyEventId,
            incidentReferenceHash,
            evidenceHash,
            action,
            actorRole,
            occurredAt
        );
    }

    function _register(bytes32 incidentReferenceHash, bytes32 evidenceHash)
        private
        returns (bool)
    {
        if (registeredIncidents[incidentReferenceHash]) {
            if (incidentEvidenceHashes[incidentReferenceHash] != evidenceHash) {
                revert EvidenceHashMismatch();
            }
            return false;
        }
        registeredIncidents[incidentReferenceHash] = true;
        incidentEvidenceHashes[incidentReferenceHash] = evidenceHash;
        return true;
    }
}
