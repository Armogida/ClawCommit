import { expect } from "chai";
import sinon from "sinon";
import { ClawCommit } from "../integrations/sdk/src/index";
import GeminiProvider from "../integrations/openclaw/GeminiProvider";

describe("GeminiProvider", () => {
  let clawCommitStub: sinon.SinonStubbedInstance<ClawCommit>;
  let provider: GeminiProvider;
  let generateContentStub: sinon.SinonStub;
  let getGenerativeModelStub: sinon.SinonStub;
  let googleClientStub: { getGenerativeModel: sinon.SinonStub };

  beforeEach(() => {
    clawCommitStub = sinon.createStubInstance(ClawCommit);
    clawCommitStub.commit.resolves({
      commitId: 1,
      hash: "0x123",
      txHash: "0x456",
    });

    generateContentStub = sinon.stub().resolves({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "test_tool",
                    args: { arg1: "value1" },
                  },
                },
              ],
            },
          },
        ],
      },
    });

    getGenerativeModelStub = sinon.stub().returns({
      generateContent: generateContentStub,
    });

    googleClientStub = {
      getGenerativeModel: getGenerativeModelStub,
    };

    provider = new GeminiProvider({
      claw: clawCommitStub,
      apiKey: "test-api-key",
      googleClient: googleClientStub,
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should handle tool calling and commit the tool calls as output", async () => {
    const tools = [
      {
        name: "test_tool",
        description: "A test tool",
        parameters: {
          type: "object",
          properties: {
            arg1: { type: "string" },
          },
        },
      },
    ];

    const result = await provider.generateAndCommit({
      prompt: "Use the test tool",
      modelVersion: "gemini-1.5-pro",
      tools,
    });

    const expectedOutput = JSON.stringify({
      tool_calls: [{ name: "test_tool", args: { arg1: "value1" } }],
    });

    expect(result.output).to.equal(expectedOutput);
    expect(result.prepared.tools).to.deep.equal(tools);

    const commitArg = clawCommitStub.commit.getCall(0).args[0];
    expect(commitArg.output).to.equal(expectedOutput);
    expect(commitArg.prompt).to.include("openclaw.gemini.toolsDigest=");
  });
});
