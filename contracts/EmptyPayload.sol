// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;

contract EmptyPayload {
    event PayloadExecuted();

    function execute() public {
        emit PayloadExecuted();
    }
}
