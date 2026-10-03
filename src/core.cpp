#include "havoc/core.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace havoc {
namespace {
constexpr float pi = 3.14159265358979323846f;
float distance2D(Vec3 a, Vec3 b) { return std::hypot(a.x - b.x, a.z - b.z); }
float clamp(float value, float low, float high) { return std::max(low, std::min(high, value)); }
Vec3 lerp(Vec3 a, Vec3 b, float t) { return a + (b - a) * t; }
}

Vec3 Vec3::operator+(const Vec3& rhs) const { return {x + rhs.x, y + rhs.y, z + rhs.z}; }
Vec3 Vec3::operator-(const Vec3& rhs) const { return {x - rhs.x, y - rhs.y, z - rhs.z}; }
Vec3 Vec3::operator*(float s) const { return {x * s, y * s, z * s}; }
Vec3& Vec3::operator+=(const Vec3& rhs) { x += rhs.x; y += rhs.y; z += rhs.z; return *this; }
float Vec3::length() const { return std::sqrt(x*x + y*y + z*z); }
Vec3 Vec3::normalized() const { const float l = length(); return l > .0001f ? *this * (1.f/l) : Vec3{}; }

bool AABB::intersects(const AABB& b) const {
    return min.x <= b.max.x && max.x >= b.min.x && min.y <= b.max.y &&
           max.y >= b.min.y && min.z <= b.max.z && max.z >= b.min.z;
}
bool AABB::contains(const Vec3& p) const {
    return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
}

const std::array<WeaponDefinition, 7>& weaponCatalog() {
    static const std::array<WeaponDefinition, 7> catalog{{
        {WeaponType::Fists, "Fists", 10, 1.7f, .42f, -1, false},
        {WeaponType::Bat, "Baseball Bat", 28, 2.3f, .65f, -1, false},
        {WeaponType::Pistol, "9mm Pistol", 24, 70, .22f, 12, false},
        {WeaponType::Smg, "Street SMG", 14, 58, .085f, 30, false},
        {WeaponType::Shotgun, "Pump Shotgun", 68, 32, .85f, 8, false},
        {WeaponType::Rifle, "Carbine", 34, 110, .13f, 30, false},
        {WeaponType::RocketLauncher, "Rocket Launcher", 180, 130, 1.4f, 1, true}
    }};
    return catalog;
}

bool WeaponInstance::canFire() const { return cooldownRemaining <= 0 && (definition.magazine < 0 || rounds > 0); }
bool WeaponInstance::fire() {
    if (!canFire()) return false;
    if (definition.magazine > 0) --rounds;
    cooldownRemaining = definition.cooldown;
    return true;
}
bool WeaponInstance::reload() {
    if (definition.magazine < 0 || reserve <= 0 || rounds == definition.magazine) return false;
    const int count = std::min(definition.magazine - rounds, reserve); rounds += count; reserve -= count; return true;
}
void WeaponInstance::update(float dt) { cooldownRemaining = std::max(0.f, cooldownRemaining - dt); }

float Character::applyDamage(float amount, EntityId attacker) {
    if (!alive()) return 0;
    const float absorbed = std::min(armor, amount * .65f); armor -= absorbed; amount -= absorbed;
    health = std::max(0.f, health - amount); target = attacker;
    state = health <= 0 ? NpcState::Dead : health < 25 ? NpcState::Injured : NpcState::Flee;
    stateTimer = state == NpcState::Injured ? 4.f : 7.f;
    return amount;
}
WeaponInstance* Character::weapon() { return inventory.empty() ? nullptr : &inventory[std::min(selectedWeapon, inventory.size()-1)]; }

void AudioQueue::emit(AudioCue cue, Vec3 position, float volume, float pitch) { pending_.push_back({cue, position, volume, pitch}); }
std::vector<AudioEvent> AudioQueue::drain() { auto result = std::move(pending_); pending_.clear(); return result; }

void PhysicsWorld::addStatic(StaticBody body) { statics_.push_back(std::move(body)); }
void PhysicsWorld::disable(EntityId id) { for (auto& body : statics_) if (body.id == id) body.active = false; }

void PhysicsWorld::resolveCharacter(Character& c) const {
    for (const auto& body : statics_) {
        if (!body.active || c.position.y > body.bounds.max.y) continue;
        const float cx = clamp(c.position.x, body.bounds.min.x, body.bounds.max.x);
        const float cz = clamp(c.position.z, body.bounds.min.z, body.bounds.max.z);
        float dx = c.position.x-cx, dz = c.position.z-cz;
        float length = std::hypot(dx,dz);
        if (length >= c.collisionRadius) continue;
        if (length < .001f) { dx = 1; dz = 0; length = 1; }
        const float push = c.collisionRadius-length;
        c.position.x += dx/length*push; c.position.z += dz/length*push;
        c.velocity.x = c.velocity.z = 0;
    }
    c.position.x = clamp(c.position.x, -245, 245); c.position.z = clamp(c.position.z, -195, 195);
}

void PhysicsWorld::resolveVehicle(Vehicle& v) const {
    AABB bounds{{v.position.x-v.halfExtents.x, v.position.y, v.position.z-v.halfExtents.z},
                {v.position.x+v.halfExtents.x, v.position.y+v.halfExtents.y*2, v.position.z+v.halfExtents.z}};
    for (const auto& body : statics_) if (body.active && bounds.intersects(body.bounds)) {
        v.position += v.velocity * -.02f; v.velocity = v.velocity * -.18f; v.engineRpm *= .5f;
    }
}

void PhysicsWorld::step(float dt, std::vector<Character>& characters, std::vector<Vehicle>& vehicles) {
    accumulator_ = std::min(accumulator_ + dt, fixedStep * 6);
    while (accumulator_ >= fixedStep) {
        for (auto& c : characters) {
            if (!c.alive()) continue;
            c.velocity.y -= 28.f * fixedStep; c.position += c.velocity * fixedStep;
            if (c.position.y <= 0) { c.position.y = 0; c.velocity.y = 0; c.grounded = true; }
            resolveCharacter(c);
        }
        for (auto& v : vehicles) { v.position += v.velocity * fixedStep; resolveVehicle(v); }
        accumulator_ -= fixedStep;
    }
}

std::optional<EntityId> PhysicsWorld::raycast(Vec3 origin, Vec3 direction, float range,
                                               const std::vector<Character>& characters, EntityId ignore) const {
    direction = direction.normalized(); float best = range; std::optional<EntityId> hit;
    for (const auto& c : characters) {
        if (!c.alive() || c.id == ignore) continue;
        const Vec3 to = c.position - origin; const float projected = to.x*direction.x + to.y*direction.y + to.z*direction.z;
        if (projected < 0 || projected > best) continue;
        const Vec3 closest = origin + direction * projected;
        if ((c.position-closest).length() <= c.collisionRadius + .35f) { best = projected; hit = c.id; }
    }
    return hit;
}

void MissionQueue::enqueue(Mission mission) { queue_.push_back(std::move(mission)); }
const Mission* MissionQueue::active() const { return queue_.empty() ? nullptr : &queue_.front(); }
const MissionObjective* MissionQueue::objective() const { const auto* m=active(); return !m || m->objectives.empty() ? nullptr : &m->objectives.front(); }
void MissionQueue::advance() {
    if (queue_.empty()) return;
    if (!queue_.front().objectives.empty()) queue_.front().objectives.pop_front();
    if (queue_.front().objectives.empty()) { completed_ = std::move(queue_.front()); queue_.pop_front(); }
}
void MissionQueue::update(float dt, const Character& player, float propertyDamage, int heat, const std::vector<Character>&) {
    auto* o = queue_.empty() || queue_.front().objectives.empty() ? nullptr : &queue_.front().objectives.front();
    if (!o) return;
    if (o->type == MissionObjective::Type::Reach) o->complete = distance2D(player.position,o->location) < o->required;
    else if (o->type == MissionObjective::Type::CauseDamage) { o->progress=propertyDamage; o->complete=o->progress>=o->required; }
    else if (o->type == MissionObjective::Type::EscapeHeat) o->complete=heat==0;
    else if (o->type == MissionObjective::Type::Wait) { o->progress+=dt; o->complete=o->progress>=o->required; }
    if (o->complete) advance();
}
void MissionQueue::signalTalk(EntityId id) { if (objective() && objective()->type==MissionObjective::Type::Talk && objective()->target==id) advance(); }
void MissionQueue::signalVehicle(EntityId id) { if (objective() && objective()->type==MissionObjective::Type::EnterVehicle && objective()->target==id) advance(); }
void MissionQueue::signalElimination(EntityId id) { if (objective() && objective()->type==MissionObjective::Type::Eliminate && objective()->target==id) advance(); }
std::optional<Mission> MissionQueue::takeCompleted() { auto value=std::move(completed_); completed_.reset(); return value; }

void CutsceneDirector::play(std::string id, std::vector<CameraKeyframe> frames, std::function<void()> callback) {
    id_=std::move(id); frames_=std::move(frames); frame_=0; elapsed_=0; playing_=!frames_.empty(); onComplete_=std::move(callback);
}
void CutsceneDirector::update(float dt) {
    if (!playing_) return;
    elapsed_ += dt;
    if (elapsed_ >= frames_[frame_].duration) { elapsed_=0; if (++frame_ >= frames_.size()) skip(); }
}
void CutsceneDirector::skip() { playing_=false; frame_=0; elapsed_=0; if (onComplete_) { auto callback=std::move(onComplete_); callback(); } }
CameraKeyframe CutsceneDirector::camera() const {
    if (frames_.empty()) return {};
    const auto& a=frames_[std::min(frame_,frames_.size()-1)];
    const auto& b=frames_[std::min(frame_+1,frames_.size()-1)]; const float t=clamp(elapsed_/std::max(.01f,a.duration),0,1);
    return {lerp(a.position,b.position,t),lerp(a.target,b.target,t),a.duration,a.fov+(b.fov-a.fov)*t};
}

void Environment::update(float dt, AudioQueue& audio, Vec3 listener) {
    timeOfDay = std::fmod(timeOfDay + dt * .015f, 24.f);
    const float targetWetness = weather == Weather::Rain || weather == Weather::Storm ? 1.f : 0.f;
    wetness += (targetWetness-wetness)*std::min(1.f,dt*.15f); wind += ((weather==Weather::Storm?1.f:.25f)-wind)*dt*.2f;
    if (weather==Weather::Storm) { lightningTimer-=dt; if (lightningTimer<=0) { lightningTimer=4.f+std::fmod(timeOfDay,5.f); audio.emit(AudioCue::Explosion,listener,.7f,.55f); } }
}

GameSimulation::GameSimulation(std::uint32_t seed) : random_(seed) {}
EntityId GameSimulation::nextId() { return nextId_++; }
Character& GameSimulation::player() { auto* p=findCharacter(playerId_); if(!p) throw std::runtime_error("player missing"); return *p; }
const Character& GameSimulation::player() const { for(const auto& c:characters_)if(c.id==playerId_)return c; throw std::runtime_error("player missing"); }
Character* GameSimulation::findCharacter(EntityId id) { for(auto& c:characters_)if(c.id==id)return &c; return nullptr; }

void GameSimulation::bootstrap() {
    characters_.clear(); vehicles_.clear();
    Character hero; hero.id=playerId_=nextId(); hero.name="Alex Mercer"; hero.faction=Faction::Player; hero.position={-12,0,10}; hero.armor=25;
    for (const auto& w : weaponCatalog()) hero.inventory.push_back({w,w.magazine<0?-1:w.magazine,w.magazine<0?0:w.magazine*3});
    characters_.push_back(hero);
    std::uniform_real_distribution<float> position(-150.f,150.f);
    for(int i=0;i<42;i++) { Character npc; npc.id=nextId(); npc.name="Citizen "+std::to_string(i+1); npc.position={position(random_),0,position(random_)}; npc.faction=i%11==0?Faction::Gang:Faction::Civilian; npc.state=NpcState::Wander; npc.stateTimer=float(i%5); if(npc.faction==Faction::Gang){const auto&w=weaponCatalog()[2];npc.inventory.push_back({w,w.magazine,24});} characters_.push_back(npc); }
    const std::array<std::string,12> names={"Sentinel","Patriot","Taxi","Banshee","PCJ 600","Faggio","Dodo","Maverick","Speeder","Reefer","Coach","Cheetah"};
    for(int i=0;i<12;i++){Vehicle v;v.id=nextId();v.name=names[i];v.position={-100.f+i*18.f,0,float((i%3)*22-20)};v.boat=i==8||i==9;v.aircraft=i==6||i==7;vehicles_.push_back(v);}
    EntityId sid=10000;
    for(int row=-2;row<=2;row++)for(int col=-2;col<=2;col++){if(row==0||col==0)continue;const Vec3 p{float(col*62),0,float(row*55)};physics_.addStatic({sid++,{{p.x-22,0,p.z-18},{p.x+22,float(20+(row+2)*5),p.z+18}},300,true,true});}
    const EntityId contact=characters_[1].id;
    missions_.enqueue({"first_score","THE FIRST SCORE",{{MissionObjective::Type::Reach,"Meet your contact",contact,characters_[1].position,4},{MissionObjective::Type::Talk,"Talk to the contact",contact},{MissionObjective::Type::CauseDamage,"Create a distraction",0,{},500},{MissionObjective::Type::EscapeHeat,"Lose the police"}},2500});
    cutscenes_.play("arrival",{{{-25,12,28},{-12,2,10},2.5f,52},{{-3,6,15},{-12,2,10},2,60}},[this]{audio_.emit(AudioCue::MissionStart,player().position);});
}

void GameSimulation::simulatePlayer(float dt,const InputFrame& input){
    auto& p=player(); const Vec3 forward{std::sin(p.heading),0,-std::cos(p.heading)},right{std::cos(p.heading),0,std::sin(p.heading)};
    Vec3 desired=(forward*input.moveForward+right*input.moveRight).normalized(); p.velocity.x=desired.x*(input.sprint?9.f:5.f);p.velocity.z=desired.z*(input.sprint?9.f:5.f);p.heading+=input.lookYaw;
    if(input.jump&&p.grounded){p.velocity.y=10;p.grounded=false;} if(input.fire)fireWeapon();if(input.interact)interact();if(input.reload&&p.weapon())p.weapon()->reload();for(auto&w:p.inventory)w.update(dt);
}

void GameSimulation::simulateNpcs(float dt){
    auto& hero=player(); std::uniform_real_distribution<float> turn(-1.f,1.f);
    for(auto& npc:characters_){if(npc.id==playerId_||!npc.alive())continue;npc.stateTimer-=dt;npc.animationTime+=dt;
        const float distance=distance2D(npc.position,hero.position);if(heat_>0&&distance<20&&npc.faction==Faction::Civilian)npc.state=NpcState::Flee;
        if(npc.target==playerId_&&npc.faction==Faction::Gang&&distance<35)npc.state=NpcState::Combat;
        if(npc.state==NpcState::Flee){const Vec3 away=(npc.position-hero.position).normalized();npc.velocity.x=away.x*6;npc.velocity.z=away.z*6;}
        else if(npc.state==NpcState::Combat){const Vec3 toward=(hero.position-npc.position).normalized();npc.velocity.x=toward.x*2;npc.velocity.z=toward.z*2;if(distance<18&&npc.weapon()&&npc.weapon()->fire()){hero.applyDamage(npc.weapon()->definition.damage,npc.id);audio_.emit(AudioCue::Gunshot,npc.position);}}
        else {if(npc.stateTimer<=0){npc.heading+=turn(random_)*pi;npc.stateTimer=2+std::abs(turn(random_))*4;}npc.velocity.x=std::sin(npc.heading)*1.4f;npc.velocity.z=-std::cos(npc.heading)*1.4f;}
        if(auto*w=npc.weapon())w->update(dt);
    }
}
void GameSimulation::simulatePolice(float dt){
    if(heat_<2)return;
    int police=0;for(const auto& c:characters_)if(c.faction==Faction::Police&&c.alive())police++;
    if(police<heat_*2){Character cop;cop.id=nextId();cop.name="LCPD Officer";cop.faction=Faction::Police;cop.state=NpcState::Combat;cop.target=playerId_;cop.position=player().position+Vec3{20.f+police*2.f,0,20};const auto&w=weaponCatalog()[2];cop.inventory.push_back({w,w.magazine,48});characters_.push_back(cop);audio_.emit(AudioCue::Siren,cop.position);}
    (void)dt;
}
void GameSimulation::updateWanted(float dt){if(!crimes_.empty()){float severity=0;while(!crimes_.empty()){severity+=crimes_.front().severity;crimes_.pop_front();}heat_=std::min(6,heat_+std::max(1,int(severity/25)));wantedCooldown_=15+heat_*8;}else if(heat_>0&&(wantedCooldown_-=dt)<=0){heat_--;wantedCooldown_=10;}}
void GameSimulation::spawnCrime(CrimeEvent crime){crimes_.push_back(crime);}

void GameSimulation::fireWeapon(){auto& p=player();auto*w=p.weapon();if(!w)return;if(!w->fire()){audio_.emit(AudioCue::Empty,p.position);return;}audio_.emit(w->definition.explosive?AudioCue::Explosion:AudioCue::Gunshot,p.position);Vec3 direction{std::sin(p.heading),0,-std::cos(p.heading)};if(auto hit=physics_.raycast(p.position+Vec3{0,1.2f,0},direction,w->definition.range,characters_,p.id)){if(auto*victim=findCharacter(*hit)){victim->applyDamage(w->definition.damage,p.id);audio_.emit(AudioCue::Hit,victim->position);spawnCrime({p.id,victim->id,victim->position,w->definition.damage});if(!victim->alive())missions_.signalElimination(victim->id);}}}
void GameSimulation::interact(){auto&p=player();for(auto&npc:characters_)if(npc.id!=p.id&&npc.alive()&&distance2D(p.position,npc.position)<3){npc.state=NpcState::Converse;npc.stateTimer=4;missions_.signalTalk(npc.id);audio_.emit(AudioCue::Dialogue,npc.position);return;}for(auto&v:vehicles_)if(distance2D(p.position,v.position)<4){v.driver=p.id;missions_.signalVehicle(v.id);audio_.emit(AudioCue::EngineStart,v.position);return;}}

void GameSimulation::update(float dt,const InputFrame& input){dt=std::min(dt,.1f);cutscenes_.update(dt);environment_.update(dt,audio_,player().position);if(!cutscenes_.playing()){simulatePlayer(dt,input);simulateNpcs(dt);simulatePolice(dt);physics_.step(dt,characters_,vehicles_);}updateWanted(dt);missions_.update(dt,player(),propertyDamage_,heat_,characters_);if(auto done=missions_.takeCompleted()){cash_+=done->cashReward;audio_.emit(AudioCue::MissionComplete,player().position);}}
} // namespace havoc
