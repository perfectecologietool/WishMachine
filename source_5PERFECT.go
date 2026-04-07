package main
import (
"bytes"
//"context"
"io"
"log"
"net/http"
"net/url"
"os"
"strings"
"time"
"strconv"
"path/filepath"
"fmt"
) 
// --- Configuratin ---
const (
listenAddr = ":8586"
ollamaServerURL = "https://www.ollama.com"

ollamaAPIPath = "/api/chat"

ollamaTagsPath = "/api/tags"
ollamaShowPath = "/api/show"

staticDir = "."
uiFile = "UXtool.html"
timeoutDuration = 100 * time.Minute
historySaveDir = "./conversation_history" 
)

func main() {
log.Println("Starting c234 server on", listenAddr)
log.Println("Proxying requests to Ollama at :", ollamaServerURL+ollamaAPIPath)
log.Println("Serving static files from:", staticDir)

/*
if err := os.MkdirAll(historySaveDir,0755); err != nil { log.Fatalf("failed to  create directory"}
*/

//Create a new ServeMux (router)
mux := http.NewServeMux()
//
// -- Handler -- 
//

//handler for the ollama proxy endpoint
mux.HandleFunc("/api/ollama", handleOllamaProxy)
mux.HandleFunc("/saveHistory", handleSaveHistory)
mux.HandleFunc("/api/tags", handleTagsProxy)
mux.HandleFunc("/api/show", handleShowProxy)

// Handler for static files including UX.html at root
//thsi serves UX.html specifically for / and uses FileServer for other files.
fileServer := http.FileServer(http.Dir(staticDir))
mux.HandleFunc("/",func(w http.ResponseWriter, r *http.Request) {
	
log.Println("file request recieved")
//ensure only GET requests. 
	if r.URL.Path == "/" {
	http.ServeFile(w, r, staticDir+"/"+uiFile)
	return
	}
	if strings.Contains(r.URL.Path, ".."){
	http.Error(w,"Invalid Path", http.StatusBadRequest)
	return
	}
	//let the fiel server handle other static files
	fileServer.ServeHTTP(w,r)
	
log.Println("file request recieved", r.URL.Path)
	})
	
	
// --- Server Configuration ---
server := &http.Server{
	Addr: listenAddr, 
	Handler: mux, 
	ReadTimeout: timeoutDuration, // handles long uploads
	WriteTimeout: timeoutDuration, //crucial for long ollama responses. 
	IdleTimeout: timeoutDuration + (1 * time.Minute),
}

// --- Start sserver ---
log.Printf("C234 server listening on %s", listenAddr)
err := server.ListenAndServe()
if err != nil && err != http.ErrServerClosed {
	log.Fatalf("could not listen on %s: %v\n", listenAddr, err)
}
log.Println("server stopped.")
}

//--handler for saving historySaveDir
func handleSaveHistory(w http.ResponseWriter, r *http.Request){ 
	log.Println("saving HIstory commenced");
	
	if r.Method != http.MethodPost {
		http.Error(w,"Method not allowed, only POST requests accepted for save History", http.StatusMethodNotAllowed)
		return;
	}
	//read the body. 
	historyJSON, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("error reading request body for savedHistory");
		http.Error(w,"savehistory failed to read body",http.StatusInternalServerError)
		return
	}
	defer r.Body.Close()
	if len(historyJSON) == 0 {
		log.Printf("recieved empty History data", r.RemoteAddr)
		return
	}
	
//uniquefilename
timestamp := time.Now().Unix()
filenameU := fmt.Sprintf("history_dump_%s.json" , strconv.FormatInt(timestamp, 10))
filePathU := filepath.Join(historySaveDir, filenameU)
//create and write file. 
fileD, err := os.Create(filePathU)
if err != nil {
	log.Printf("Error creating history file ", filePathU, err)
return
}
defer fileD.Close()

_, err = fileD.Write(historyJSON)
if err != nil {
	log.Printf("error in writing to file %s", filePathU)
return
}

log.Printf("successfullysaved conversation history to %s", filePathU)
w.WriteHeader(http.StatusOK)
w.Write([]byte(fmt.Sprintf("conversationhistory saved successfully to %s", filenameU)))
}


//copyHeaders copies specific headers from source to destination/skips certain headers like connection which are hopbyhop
func copyHeader(dst, scr http.Header){
	for k, vv := range scr {
		//filter hopbyhop headers? )often handled by server/client// EG: if k == "Connection" || k == "Proxy-Connection" 
		for _, vb := range vv {
			dst.Add(k,vb)
		}
	}
}


//proxy for /api/tags (standard ollama endpoint)
//returns list of available models.
func handleTagsProxy(w http.ResponseWriter, r *http.Request){
	targetURL := ollamaServerURL + ollamaTagsPath
//create request to ollama
proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
proxyReq.Header.Set("Authorization", "Bearer 09bcc71ac2ee449f9e0545259f7f2c90.cKc7ayF9G3-Ka9qPIHR7ZdMQ") 
if err != nil {
log.Printf("error creating proxy request for tags %v", err)
http.Error(w, "proxy creation failed", http.StatusInternalServerError)
return
}

//execute request
client := http.DefaultClient
resp, err := client.Do(proxyReq)
if err != nil {
log.Printf("error contacting ollama at %s: %v", targetURL, err)
http.Error(w, "Ollama unreachable", http.StatusBadGateway)
return
}
defer resp.Body.Close()

//forward response headers and body. 
copyHeader(w.Header(), resp.Header)
w.WriteHeader(resp.StatusCode)
//stream the JSON back to client
if _, err := io.Copy(w, resp.Body); err != nil {
log.Printf("error streaming tags response: %v", err)
}
}

//Proxy for /api/show (standard ollama endpoint)  returns detaile metadata for a model. 
func handleShowProxy(w http.ResponseWriter, r *http.Request){
if r.Method != http.MethodPost {
http.Error(w, "only POST allowed", http.StatusMethodNotAllowed)
return
}	

targetURL := ollamaServerURL + ollamaShowPath 

//read the incoming JSon body to roward its
bodyBytes, err := io.ReadAll(r.Body)
if err != nil {
	http.Error(w, "Failed to read Request body", http.StatusInternalServerError)
	return
}
defer r.Body.Close()

//create proxy request
proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, bytes.NewBuffer(bodyBytes))
if err != nil {
	log.Printf("error creating proxy request for show")
	http.Error(w, "Proxy creation failed", http.StatusInternalServerError)
	return
}

proxyReq.Header.Set("Content-Type", "application/json")
proxyReq.Header.Set("Authorization", "Bearer 09bcc71ac2ee449f9e0545259f7f2c90.cKc7ayF9G3-Ka9qPIHR7ZdMQ") 
//execute request 
client := http.DefaultClient
resp, err := client.Do(proxyReq)
if err != nil {
	log.Printf("Error contacting Ollama at %s: %v", targetURL, err)
	http.Error(w, "Ollama unreachable", http.StatusBadGateway)
return
}
defer resp.Body.Close()

copyHeader(w.Header(), resp.Header)
w.WriteHeader(resp.StatusCode)

if _, err := io.Copy(w, resp.Body); err != nil {
	log.Printf("error streaming show response: %v", err)
}
}
	


// --- Proxy Handler Logic ---
// handleOllamaProxy forwards requests to the Ollama server and strewams the response.
func handleOllamaProxy(w http.ResponseWriter, r *http.Request){
	//1. validate request method (POST)
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed: Only POST requests are accepted", http.StatusMethodNotAllowed)
		log.Printf("Received nonPOST request on /api/ollama from %s",r.RemoteAddr)
	return
	}
	//2. Prepare the request to Ollama
	ollamaURL := ollamaServerURL + ollamaAPIPath

//read the body from the incoming request (from UX.html)
//read it into a buffer first in case its needed later or if underlying stream needs closing
clientRequestBody, err := io.ReadAll(r.Body)
if err != nil {
	http.Error(w, "failed to read request body", http.StatusInternalServerError)
	log.Printf("Error reading request body from %s: %v", r.RemoteAddr, err)
return
}
defer r.Body.Close()// close the original request

//create a new request to the ollama server
proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, ollamaURL, bytes.NewReader(clientRequestBody))
if err != nil {
	http.Error(w, "failed to create proxy request", http.StatusInternalServerError)
	log.Printf("error creating proxy request %v",err)
	return
}	

//3. copy Headers
//copy necessary headers from the client request to proxy request
proxyReq.Header.Set("Content-Type", r.Header.Get("Content-Type"))
proxyReq.Header.Set("Accept", r.Header.Get("Accept"))//often "application/json" for streaming. 
proxyReq.Header.Set("Authorization", "Bearer 09bcc71ac2ee449f9e0545259f7f2c90.cKc7ayF9G3-Ka9qPIHR7ZdMQ") 
//Due to change in website from localhost to ollama.com
//set the host header correctly for ollama server
targetURL, _ := url.Parse(ollamaServerURL)
proxyReq.Host = targetURL.Host 
//anything else? 

log.Printf("proxying request for %s to %s", r.RemoteAddr, ollamaURL)

//4. Execute the request to Ollama
//Use a client with potentially adjusted timeouts if needed; DefaultClient respects context.
client := http.DefaultClient
ollamaResp, err := client.Do(proxyReq)
if err != nil {
	//handle some errors
	if os.IsTimeout(err) {
		http.Error(w,"gateway timeout: ollama server timed out", http.StatusGatewayTimeout)
		log.Printf("Timeout connecting to Ollama %v", err)
	}else{
		http.Error(w,"bad gateway: error contacting ollama server", http.StatusBadGateway)
		log.Printf("error connecting to ollama %v", err)
	}
return
}
defer ollamaResp.Body.Close() 

log.Printf("recived response from ollama %d", ollamaResp.StatusCode)

//5. Stream the response back to the original client (browser)
//Copy ollama response headers
copyHeader(w.Header(), ollamaResp.Header)
//write the ollama status code to ur response writer
w.WriteHeader(ollamaResp.StatusCode)

flusher, ok := w.(http.Flusher)
if !ok {
	log.Println("Warning: ResponseWriter doesnt support flushing")
}

//use io.copy to efficiently stream the body//io.copy handles chucked encoding automatically if present in ollamaResp
bytesCopied, err := io.Copy(flushWriter{w,flusher}, ollamaResp.Body)
if err != nil {
	//this error might occur if the client disconeccted
	log.Printf("Error streaming ollama sresponse to client %s:%v",r.RemoteAddr, err)
}
log.Printf("finished streaming response to %s (%d)", r.RemoteAddr, bytesCopied)
}

//flushWriter is a helper to flush the response writer after each write call. This ensures chunks are sent immediately over the network. 
type flushWriter struct {
	w http.ResponseWriter
	flusher http.Flusher
}

func (fw flushWriter) Write (p []byte) (n int, err error){
	n, err = fw.w.Write(p)//write the data
	if fw.flusher != nil {
		fw.flusher.Flush()//flush data to the client
	}
	return 
}

