// SPDX-License-Identifier: MIT
// ============================================================================
// DEMO PROOF-OF-CONCEPT TESTS — no dependencies, no forge-std. Run with:
//   forge test
// The cheatcode interface below is the standard Foundry `Vm` interface,
// declared inline so this demo needs no git submodules.
// ============================================================================

pragma solidity ^0.8.0;

import "../src/DemoVault.sol";
import "../src/DemoVaultFixed.sol";
import "../src/Attacker.sol";

interface Vm {
    function deal(address who, uint256 newBalance) external;
    function prank(address who) external;
}

contract DemoVaultTest {
    Vm private constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant VICTIM = address(0x1001);
    uint256 private constant VICTIM_DEPOSIT = 10 ether;
    uint256 private constant ATTACKER_FUNDS = 1 ether;

    /// @notice The finding, demonstrated: a 1-ether attacker drains the
    /// entire vault (its own 1 ether + the victim's 10 ether) in one call.
    function testReentrancyDrainsVault() external {
        DemoVault vault = new DemoVault();
        vm.deal(VICTIM, VICTIM_DEPOSIT);
        vm.prank(VICTIM);
        vault.deposit{value: VICTIM_DEPOSIT}();

        Attacker attacker = new Attacker(address(vault));
        vm.deal(address(attacker), ATTACKER_FUNDS);
        attacker.attack();

        require(vault.vaultBalance() == 0, "vault should be empty");
        require(
            address(attacker).balance == VICTIM_DEPOSIT + ATTACKER_FUNDS,
            "attacker should hold victim funds + own deposit"
        );
        require(attacker.reentries() == 10, "expected 10 reentrant calls");
    }

    /// @notice The verifier's counterfactual: the same attack against the
    /// fixed vault must FAIL and leave all funds in place.
    function testFixedVaultBlocksReentrancy() external {
        DemoVaultFixed vault = new DemoVaultFixed();
        vm.deal(VICTIM, VICTIM_DEPOSIT);
        vm.prank(VICTIM);
        vault.deposit{value: VICTIM_DEPOSIT}();

        Attacker attacker = new Attacker(address(vault));
        vm.deal(address(attacker), ATTACKER_FUNDS);
        (bool ok, ) = address(attacker).call(
            abi.encodeWithSignature("attack()")
        );
        require(!ok, "attack must fail against the fixed vault");
        require(
            vault.vaultBalance() == VICTIM_DEPOSIT,
            "victim funds must stay in the vault"
        );
        require(
            address(attacker).balance == ATTACKER_FUNDS,
            "attacker must keep only its own funds"
        );
    }

    /// @notice Sanity: an honest deposit and full withdrawal work.
    function testHonestWithdrawWorks() external {
        DemoVault vault = new DemoVault();
        vm.deal(VICTIM, VICTIM_DEPOSIT);
        vm.prank(VICTIM);
        vault.deposit{value: VICTIM_DEPOSIT}();
        vm.prank(VICTIM);
        vault.withdraw();
        require(vault.vaultBalance() == 0, "vault should be empty");
        require(vault.balances(VICTIM) == 0, "ledger should be zeroed");
        require(VICTIM.balance == VICTIM_DEPOSIT, "victim should be whole");
    }
}
