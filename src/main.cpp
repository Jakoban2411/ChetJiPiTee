#include "havoc/core.hpp"
#include "raylib.h"
#include "rlgl.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdlib>
#include <map>
#include <vector>

namespace {
Vector3 rv(havoc::Vec3 v) { return {v.x,v.y,v.z}; }
Color factionColor(havoc::Faction f) {
    switch(f){case havoc::Faction::Player:return GOLD;case havoc::Faction::Gang:return MAROON;case havoc::Faction::Police:return BLUE;default:return Color{235,160,120,255};}
    return WHITE;
}

struct AudioBank {
    std::map<havoc::AudioCue,Sound> sounds;
    std::vector<Wave> waves;
    bool ready{};
    AudioBank() {
        InitAudioDevice();
        ready = IsAudioDeviceReady();
        if (!ready) return;
        const std::array cues={havoc::AudioCue::Footstep,havoc::AudioCue::EngineStart,havoc::AudioCue::Gunshot,havoc::AudioCue::Empty,havoc::AudioCue::Hit,havoc::AudioCue::Explosion,havoc::AudioCue::Splash,havoc::AudioCue::Siren,havoc::AudioCue::MissionStart,havoc::AudioCue::MissionComplete,havoc::AudioCue::Dialogue};
        int index=0;for(auto cue:cues){const int rate=22050,frames=rate/5;auto*data=new float[frames];const float frequency=110.f+index*47.f;for(int i=0;i<frames;i++){const float t=float(i)/rate;const float decay=std::exp(-t*(cue==havoc::AudioCue::Siren?3.f:12.f));data[i]=std::sin(t*frequency*6.28318f)*decay*.32f;}Wave wave{static_cast<unsigned>(frames),rate,32,1,data};sounds[cue]=LoadSoundFromWave(wave);waves.push_back(wave);index++;}
    }
    ~AudioBank(){if(!ready)return;for(auto&[_,sound]:sounds)UnloadSound(sound);for(auto&w:waves)delete[] static_cast<float*>(w.data);CloseAudioDevice();}
    void play(const havoc::AudioEvent& event){if(!ready)return;auto it=sounds.find(event.cue);if(it==sounds.end())return;SetSoundVolume(it->second,event.volume);SetSoundPitch(it->second,event.pitch);PlaySound(it->second);}
};

void drawCharacter(const havoc::Character& c,float time){
    if(!c.alive()){DrawCube(rv(c.position+havoc::Vec3{0,.25f,0}),1.7f,.45f,.7f,DARKGRAY);return;}
    const Color shirt=factionColor(c.faction);const float stride=std::sin(c.animationTime*8)*.32f;
    DrawCube(rv(c.position+havoc::Vec3{0,1.65f,0}),1.15f,1.7f,.65f,shirt);
    DrawSphere(rv(c.position+havoc::Vec3{0,2.9f,0}),.48f,Color{185,121,83,255});
    DrawCube(rv(c.position+havoc::Vec3{-.38f,.7f,stride}),.3f,1.35f,.36f,DARKBLUE);
    DrawCube(rv(c.position+havoc::Vec3{.38f,.7f,-stride}),.3f,1.35f,.36f,DARKBLUE);
    if(c.state==havoc::NpcState::Combat)DrawCylinderEx(rv(c.position+havoc::Vec3{.6f,2,0}),rv(c.position+havoc::Vec3{.6f,2,-1}),.08f,.08f,8,BLACK);
    if(c.health<100){DrawCube(rv(c.position+havoc::Vec3{0,3.7f,0}),1.2f,.09f,.08f,DARKGRAY);DrawCube(rv(c.position+havoc::Vec3{-(1-c.health/100)*.6f,3.7f,-.01f}),1.2f*c.health/100,.1f,.09f,RED);}
    (void)time;
}

void drawVehicle(const havoc::Vehicle& v){
    rlPushMatrix();rlTranslatef(v.position.x,v.position.y,v.position.z);rlRotatef(v.heading*RAD2DEG,0,1,0);
    const Color paint=v.boat?SKYBLUE:v.aircraft?LIGHTGRAY:Color{180,45,85,255};
    DrawCube({0,1,0},v.halfExtents.x*2,v.halfExtents.y*1.4f,v.halfExtents.z*2,paint);
    if(v.aircraft){DrawCube({0,1.4f,0},10,.2f,2,paint);DrawCube({0,1.7f,2},4,.15f,1,paint);}
    else if(v.boat)DrawCube({0,2,.4f},v.halfExtents.x,1,2,DARKBLUE);
    else {DrawCube({0,2,.2f},v.halfExtents.x*1.4f,1,v.halfExtents.z,DARKBLUE);for(float x:{-v.halfExtents.x,v.halfExtents.x})for(float z:{-1.4f,1.4f})DrawCylinderEx({x,.55f,z-.3f},{x,.55f,z+.3f},.48f,.48f,12,BLACK);}
    rlPopMatrix();
}
}

int main(){
    SetConfigFlags(FLAG_MSAA_4X_HINT|FLAG_VSYNC_HINT|FLAG_WINDOW_RESIZABLE);
    InitWindow(1440,900,"Havoc City — C++ Open World");DisableCursor();AudioBank audio;
    havoc::GameSimulation game;game.bootstrap();
    Camera3D camera{{0,14,24},{0,2,0},{0,1,0},58,CAMERA_PERSPECTIVE};float yaw=0,pitch=.34f;
    const bool capturePreview = std::getenv("HAVOC_CAPTURE_PREVIEW") != nullptr;
    int renderedFrames = 0;
    SetTargetFPS(120);
    while(!WindowShouldClose()){
        const float dt=GetFrameTime();const Vector2 mouse=GetMouseDelta();yaw-=mouse.x*.0022f;pitch=std::clamp(pitch-mouse.y*.0018f,.12f,1.1f);
        havoc::InputFrame input;input.moveForward=float(IsKeyDown(KEY_W))-float(IsKeyDown(KEY_S));input.moveRight=float(IsKeyDown(KEY_D))-float(IsKeyDown(KEY_A));input.lookYaw=-mouse.x*.0022f;input.sprint=IsKeyDown(KEY_LEFT_SHIFT);input.jump=IsKeyPressed(KEY_SPACE);input.fire=IsMouseButtonDown(MOUSE_BUTTON_LEFT);input.interact=IsKeyPressed(KEY_E);input.reload=IsKeyPressed(KEY_R);
        if(IsKeyPressed(KEY_ONE))game.player().selectedWeapon=0;
        if(IsKeyPressed(KEY_TWO))game.player().selectedWeapon=1;
        if(IsKeyPressed(KEY_THREE))game.player().selectedWeapon=2;
        if(IsKeyPressed(KEY_FOUR))game.player().selectedWeapon=3;
        if(IsKeyPressed(KEY_FIVE))game.player().selectedWeapon=4;
        if(IsKeyPressed(KEY_SIX))game.player().selectedWeapon=5;
        if(IsKeyPressed(KEY_SEVEN))game.player().selectedWeapon=6;
        if(game.cutscenes().playing()){if(IsKeyPressed(KEY_ESCAPE))game.cutscenes().skip();game.update(dt,{});const auto shot=game.cutscenes().camera();camera.position=rv(shot.position);camera.target=rv(shot.target);camera.fovy=shot.fov;}else{game.update(dt,input);const auto&p=game.player();const float distance=11;camera.position=rv(p.position+havoc::Vec3{std::sin(yaw)*distance*std::cos(pitch),distance*std::sin(pitch)+2,std::cos(yaw)*distance*std::cos(pitch)});camera.target=rv(p.position+havoc::Vec3{0,2,0});camera.fovy=58;}
        for(const auto&event:game.audio().drain())audio.play(event);
        BeginDrawing();ClearBackground(Color{241,145,126,255});BeginMode3D(camera);
        DrawPlane({0,0,0},{500,400},Color{52,76,65,255});
        for(int i=-3;i<=3;i++){DrawCube({float(i*62),.08f,0},36,.16f,400,Color{37,42,49,255});DrawCube({0,.09f,float(i*55)},500,.18f,28,Color{37,42,49,255});}
        for(const auto&body:game.physics().statics())if(body.active){const auto size=body.bounds.max-body.bounds.min;const auto center=(body.bounds.min+body.bounds.max)*.5f;DrawCube(rv(center),size.x,size.y,size.z,Color{63,67,73,255});DrawCubeWires(rv(center),size.x,size.y,size.z,Color{92,107,116,255});}
        for(const auto&v:game.vehicles())drawVehicle(v);
        for(const auto&c:game.characters())drawCharacter(c,GetTime());
        EndMode3D();
        DrawRectangle(0,0,GetScreenWidth(),72,Fade(BLACK,.72f));DrawText("HAVOC CITY",28,17,30,GOLD);DrawText(TextFormat("$%06i",game.cash()),GetScreenWidth()-210,18,25,RAYWHITE);DrawText(TextFormat("HEAT  %.*s",game.heat(),"!!!!!!"),GetScreenWidth()-210,48,14,PINK);
        if(const auto*mission=game.missions().active()){DrawRectangle(25,95,360,115,Fade(BLACK,.78f));DrawText("ACTIVE JOB",42,108,13,GOLD);DrawText(mission->title.c_str(),42,132,27,RAYWHITE);if(const auto*objective=game.missions().objective())DrawText(objective->text.c_str(),42,171,17,LIGHTGRAY);}
        const auto*weapon=game.player().weapon();if(weapon){DrawRectangle(GetScreenWidth()-275,GetScreenHeight()-100,250,70,Fade(BLACK,.75f));DrawText(weapon->definition.name.c_str(),GetScreenWidth()-255,GetScreenHeight()-86,20,RAYWHITE);DrawText(TextFormat("%i / %i",weapon->rounds,weapon->reserve),GetScreenWidth()-255,GetScreenHeight()-59,18,GOLD);}
        DrawCircle(GetScreenWidth()/2,GetScreenHeight()/2,3,RAYWHITE);DrawText("WASD MOVE  |  MOUSE AIM  |  LMB FIRE  |  E INTERACT  |  SPACE JUMP",25,GetScreenHeight()-30,14,Fade(RAYWHITE,.7f));
        if(game.cutscenes().playing()){DrawRectangle(0,0,GetScreenWidth(),70,BLACK);DrawRectangle(0,GetScreenHeight()-70,GetScreenWidth(),70,BLACK);DrawText("ESC TO SKIP",GetScreenWidth()-130,GetScreenHeight()-45,12,GRAY);}
        if(game.environment().weather==havoc::Weather::Rain||game.environment().weather==havoc::Weather::Storm)for(int i=0;i<180;i++){const int x=(i*83+int(GetTime()*500))%GetScreenWidth();const int y=(i*47+int(GetTime()*800))%GetScreenHeight();DrawLine(x,y,x-5,y+18,Fade(SKYBLUE,.45f));}
        EndDrawing();
        if (capturePreview && ++renderedFrames == 90) { TakeScreenshot("havoc-city-preview.png"); break; }
    }
    CloseWindow();return 0;
}
