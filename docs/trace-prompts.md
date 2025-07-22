##  Todos
     ☒ Analyze request handling and transformation from request to GitHub copilot API  in the src code               
     ☐ Study claude-trace package for tracing patterns and best practices at ../trace. Do deep research of the code. But I don't need the CLI behavior, I just need to add  tracing of each request and response  to my server. 
     ☐ Document how to save the tuple for each request and response: received request, translated request to GitHub API, received response from GitHub and translated response to return
     ☐ Design tracing code structure and integration points between current code and tracing system
     ☐ Define trace json schema and storage under traces/ directory, use log.json for all requests and responses and errors.json for failed ones. Include current logging text in the trace data, aside from req and responses.
     * auto rotate log data to cap at 100KB size.


## Allow dynamically change trace settings instead of at startup time
 
