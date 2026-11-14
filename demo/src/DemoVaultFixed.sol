// SPDX-License-Identifier: MIT
// ============================================================================
// DEMO TARGET — FIXED VERSION. Same vault as DemoVault.sol, with the
// intentional reentrancy removed: the balance is zeroed BEFORE the external
// call (checks-effects-interactions). The demo runner attacks this contract
// too, as the verifier's counterfactual check: the attack must FAIL here,
// proving the finding is about the code order and not about the test setup.
// ============================================================================

pragma solidity ^0.8.0;

/// @title DemoVaultFixed — the same demo vault with the reentrancy fixed
contract DemoVaultFixed {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    /// @notice Withdraw the caller's full deposited balance.
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "nothing to withdraw");
        // FIX: effects BEFORE the external call. A re-entered withdraw()
        // now reads a zero balance and reverts.
        balances[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }

    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
