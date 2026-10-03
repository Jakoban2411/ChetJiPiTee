#include "havoc/core.hpp"
#include <cassert>
#include <iostream>

int main() {
    using namespace havoc;
    GameSimulation game(42); game.bootstrap();
    assert(game.characters().size() == 43);
    assert(game.vehicles().size() == 12);
    assert(game.missions().active());

    auto& victim = game.characters()[1];
    const float health = victim.health;
    victim.applyDamage(30, game.player().id);
    assert(victim.health < health && victim.state == NpcState::Flee);

    WeaponInstance pistol{weaponCatalog()[2], 1, 12};
    assert(pistol.fire() && pistol.rounds == 0 && !pistol.fire());
    assert(pistol.reload() && pistol.rounds == 12);

    Character falling; falling.id=999; falling.position={0,10,0};
    std::vector<Character> bodies{falling}; std::vector<Vehicle> vehicles;
    PhysicsWorld physics;
    for(int i=0;i<120;i++) physics.step(1.f/60.f,bodies,vehicles);
    assert(bodies[0].position.y == 0 && bodies[0].grounded);

    AudioQueue audio; audio.emit(AudioCue::Gunshot,{1,2,3});
    assert(audio.drain().size()==1 && audio.drain().empty());
    std::cout << "Havoc City simulation tests passed\n";
}
