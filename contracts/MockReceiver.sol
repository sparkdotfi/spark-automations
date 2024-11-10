// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;

interface IExecutor {
    function queue(
        address[] memory targets,
        uint256[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas,
        bool[] memory withDelegatecalls
    ) external;
}

contract MockReceiver {
    address public executor;

    constructor(address _executor) {
        executor = _executor;
    }

    function __callQueueOnExecutor(address _payload) public {
        address[] memory targets = new address[](1);
        targets[0] = address(_payload);
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        string[] memory signatures = new string[](1);
        signatures[0] = "execute()";
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = "";
        bool[] memory withDelegatecalls = new bool[](1);
        withDelegatecalls[0] = true;

        IExecutor(executor).queue(
            targets,
            values,
            signatures,
            calldatas,
            withDelegatecalls
        );
    }
}
