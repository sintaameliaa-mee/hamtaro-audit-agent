// SPDX-License-Identifier: MIT
// ============================================================================
// DEMO TARGET — INTENTIONAL VULNERABILITY. DO NOT DEPLOY. DO NOT USE WITH
// REAL FUNDS. DO NOT COPY INTO PRODUCTION CODE.
//
// This contract exists ONLY as a teaching target for the security-audit
// demo runner in this repository. It contains ONE deliberate bug, labelled
// below: a classic reentrancy in withdraw() (external call before the state
// update). The demo pipeline's job is to find it, prove it with a runnable
// PoC, and confirm it through an independent verifier step.
//
// The fixed version is DemoVaultFixed.sol in this same directory.
// ============================================================================

pragma solidity ^0.8.0;

/// @title DemoVault — intentionally vulnerable demo vault (reentrancy)
/// @notice Users deposit ETH and withdraw their full balance later. The
/// vault holds all deposits in a single balance; each depositor has an
/// individual ledger entry in `balances`.
contract DemoVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    /// @notice Withdraw the caller's full deposited balance.
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "nothing to withdraw");
        // *** INTENTIONAL BUG (demo only) ***
        // The external call happens BEFORE the balance is zeroed, so a
        // malicious receiver can re-enter withdraw() and be paid again
        // while its balance still reads as non-zero. This is the classic
        // DAO-style reentrancy: checks -> interaction -> effects (wrong
        // order). Each re-entered call pays out the full recorded balance.
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        balances[msg.sender] = 0;
    }

    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
