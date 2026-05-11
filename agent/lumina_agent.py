import os
from typing import Annotated
from typing_extensions import TypedDict

# LangChain / Vertex AI Imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
# from langchain.tools.retriever import create_retriever_tool

# LangGraph Imports
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from dotenv import load_dotenv
load_dotenv()


# --- 1. INITIALIZATION ---
PROJECT_ID = os.getenv("PROJECT_ID")
REGION = "us-central1"

# Initialize the Gemini Model
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-pro",
    project=PROJECT_ID,
    location=REGION,
    temperature=1.0
)

# ======================================================================
# 🛑 STUDENT TASK 1: PROMPT ENGINEERING
# ======================================================================
# Modify this system prompt to give the agent its persona ("Project Lumina").
# Instruct it to act as a compliance and policy assistant for loan officers.
# It MUST use the provided tools to answer questions and cite its sources.
# It MUST refuse to answer questions outside of Aegis Financial policies.

SYSTEM_PROMPT = """
You are a helpful assistant. Answer the user's questions.
"""

# ======================================================================
# 🛑 STUDENT TASK 2: RAG TOOL INTEGRATION
# ======================================================================
# 1. You need to connect to your AlloyDB vector store from Challenge 2.
# 2. Create a retriever from that vector store.
# 3. Use `create_retriever_tool` to turn it into a tool the agent can use.

# Placeholder list for your tools. 
# Once you build your retriever tool, add it to this list!
tools = [] # e.g., tools = [my_aegis_retriever_tool]


# --- 2. LANGGRAPH SETUP (Core Agent Logic) ---

# Bind tools to the LLM if any exist
if tools:
    llm_with_tools = llm.bind_tools(tools)
else:
    llm_with_tools = llm

# Define the Agent's State (Memory)
class State(TypedDict):
    messages: Annotated[list, add_messages]

# Define the core "Agent" Node
def call_model(state: State):
    messages = state["messages"]
    
    # Inject the System Prompt at the beginning of the conversation
    if not isinstance(messages[0], SystemMessage):
         messages = [SystemMessage(content=SYSTEM_PROMPT)] + messages
    else:
         messages[0] = SystemMessage(content=SYSTEM_PROMPT)
         
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}

# Build the Graph Workflow
workflow = StateGraph(State)

# Add the main reasoning node
workflow.add_node("agent", call_model)

# If tools are configured, add the tool execution node and routing
if tools:
    tool_node = ToolNode(tools)
    workflow.add_node("tools", tool_node)
    
    # Route: If LLM decides to use a tool, go to "tools". Otherwise, end.
    workflow.add_conditional_edges("agent", tools_condition)
    # Route: After using a tool, go back to the agent to read the tool's output.
    workflow.add_edge("tools", "agent")

workflow.add_edge(START, "agent")

# Compile the agent application
lumina_agent = workflow.compile()


# ======================================================================
# 🚀 TEST YOUR AGENT
# ======================================================================
def chat_with_lumina(message: str):
    print(f"\n👤 User: {message}")
    print("🤖 Lumina is thinking...\n")
    
    # Stream the graph execution to see the steps (Agent -> Tool -> Agent)
    for event in lumina_agent.stream({"messages": [HumanMessage(content=message)]}):
        for key, value in event.items():
            if key == "agent":
                # Check if it called a tool or gave a final answer
                msg = value["messages"][0]
                if msg.tool_calls:
                    print(f"   [Lumina is calling tool: {msg.tool_calls[0]['name']}]")
                else:
                    print(f"Lumina: {msg.content}")
            elif key == "tools":
                print(f"   [Tool returned data...]")

# Uncomment below to test once you have configured your prompt and tools!
# chat_with_lumina("Hello, what is your purpose?")
# chat_with_lumina("What is the maximum back-end DTI for a conventional mortgage?")